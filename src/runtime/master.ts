import crypto from 'node:crypto'

import { type SessionRecord, SessionStore } from '../session/store.js'

import {
  appendTaskRecord,
  loadTaskLedger,
  maybeCompactTaskLedger,
  type TaskRecord,
} from './ledger.js'
import {
  normalizeMaxIterations,
  sanitizeVerifyCommand,
  trimText,
} from './master/helpers.js'
import { runTask } from './master/task-runner.js'
import { Semaphore, SessionQueue } from './queue.js'

import type { Config, ResumePolicy } from '../config.js'

export type TaskRequest = {
  sessionKey: string
  prompt: string
  resume?: ResumePolicy
  verifyCommand?: string
  maxIterations?: number
  triggeredByTaskId?: string
}

export class Master {
  private config: Config
  private sessionStore: SessionStore
  private tasks: Map<string, TaskRecord>
  private queue: SessionQueue
  private semaphore: Semaphore
  private compactionTimer?: NodeJS.Timeout
  private compactionPromise: Promise<void> | undefined

  private constructor(
    config: Config,
    sessionStore: SessionStore,
    tasks: Map<string, TaskRecord>,
  ) {
    this.config = config
    this.sessionStore = sessionStore
    this.tasks = tasks
    this.queue = new SessionQueue()
    this.semaphore = new Semaphore(config.maxWorkers)
  }

  static async create(config: Config): Promise<Master> {
    const sessionStore = await SessionStore.load(config.stateDir)
    const tasks = await loadTaskLedger(config.stateDir)
    const master = new Master(config, sessionStore, tasks)
    await master.recover()
    master.startAutoCompaction()
    return master
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId)
  }

  listSessions(): SessionRecord[] {
    const sessions = Object.values(this.sessionStore.all())
    sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return sessions
  }

  async deleteSession(
    sessionKey: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const trimmed = sessionKey.trim()
    if (!trimmed) return { ok: false, reason: 'invalid_session' }
    if (this.hasActiveTasks(trimmed))
      return { ok: false, reason: 'active_tasks' }
    const removed = await this.sessionStore.remove(trimmed)
    if (!removed) return { ok: false, reason: 'not_found' }
    return { ok: true }
  }

  async enqueueTask(request: TaskRequest): Promise<TaskRecord> {
    if (this.compactionPromise) await this.compactionPromise
    const taskId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const now = new Date().toISOString()
    const verifyCommand = sanitizeVerifyCommand(request.verifyCommand)
    const needsIterations = Boolean(verifyCommand)
    const maxIterations = needsIterations
      ? normalizeMaxIterations(request.maxIterations, this.config.maxIterations)
      : undefined
    const baseRecord: TaskRecord = {
      id: taskId,
      status: 'queued',
      sessionKey: request.sessionKey,
      runId,
      retries: 0,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
      resume: request.resume ?? this.config.resumePolicy,
      prompt: request.prompt,
    }
    const record: TaskRecord = {
      ...baseRecord,
      ...(verifyCommand ? { verifyCommand } : {}),
      ...(maxIterations !== undefined ? { maxIterations } : {}),
      ...(request.triggeredByTaskId
        ? { triggeredByTaskId: request.triggeredByTaskId }
        : {}),
    }

    this.tasks.set(taskId, record)
    try {
      await appendTaskRecord(this.config.stateDir, record)
    } catch (error) {
      this.tasks.delete(taskId)
      throw error
    }
    this.enqueueRecord(record)
    return record
  }

  private enqueueRecord(record: TaskRecord): void {
    void this.queue.enqueue(record.sessionKey, async () => {
      const release = await this.semaphore.acquire()
      try {
        await runTask(
          {
            config: this.config,
            sessionStore: this.sessionStore,
            tasks: this.tasks,
            onTriggerFollowup: this.maybeTriggerFollowup.bind(this),
          },
          record.id,
        )
      } finally {
        release()
      }
    })
  }

  private hasActiveTasks(sessionKey?: string): boolean {
    for (const task of this.tasks.values()) {
      if (sessionKey && task.sessionKey !== sessionKey) continue
      if (task.status === 'queued' || task.status === 'running') return true
    }
    return false
  }

  private autoCompactionEnabled(): boolean {
    if (this.config.taskLedgerAutoCompactIntervalMs <= 0) return false
    if (
      this.config.taskLedgerMaxBytes <= 0 &&
      this.config.taskLedgerMaxRecords <= 0
    )
      return false
    return true
  }

  private startAutoCompaction(): void {
    if (!this.autoCompactionEnabled()) return
    const intervalMs = this.config.taskLedgerAutoCompactIntervalMs
    const run = async (): Promise<void> => {
      if (this.compactionPromise) return
      if (this.hasActiveTasks()) return
      this.compactionPromise = (async () => {
        await maybeCompactTaskLedger(this.config.stateDir, {
          maxBytes: this.config.taskLedgerMaxBytes,
          maxRecords: this.config.taskLedgerMaxRecords,
        })
      })()
      try {
        await this.compactionPromise
      } finally {
        this.compactionPromise = undefined
      }
    }

    void run()
    this.compactionTimer = setInterval(() => {
      void run()
    }, intervalMs)
    this.compactionTimer.unref()
  }

  private async recover(): Promise<void> {
    for (const record of this.tasks.values()) {
      if (!record.prompt) continue
      if (record.status === 'queued') this.enqueueRecord(record)

      if (record.status === 'running') {
        const now = new Date().toISOString()
        const refreshed: TaskRecord = {
          ...record,
          status: 'queued',
          runId: crypto.randomUUID(),
          retries: record.retries + 1,
          updatedAt: now,
        }
        await appendTaskRecord(this.config.stateDir, refreshed)
        this.tasks.set(record.id, refreshed)
        this.enqueueRecord(refreshed)
      }
    }
  }

  private async maybeTriggerFollowup(
    task: TaskRecord,
    reason: string,
  ): Promise<void> {
    if (task.triggeredByTaskId) return
    const basePrompt = this.config.triggerOnFailurePrompt
    const trimmedBase = basePrompt?.trim()
    if (!trimmedBase) return
    const lines = [
      trimmedBase,
      '',
      `Triggered by task ${task.id} (${task.sessionKey}).`,
      'Status: failed',
      `Reason: ${trimText(reason, 800)}`,
    ]
    const prompt = lines.join('\n')
    await this.enqueueTask({
      sessionKey: this.config.triggerSessionKey,
      prompt,
      resume: 'never',
      triggeredByTaskId: task.id,
    })
  }
}
