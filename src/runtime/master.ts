import crypto from 'node:crypto'

import { type SessionRecord, SessionStore } from '../session/store.js'
import { writeJsonFileAtomic } from '../utils/fs.js'

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
import { startSelfImprove } from './self-improve.js'

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
  private startedAt: number
  private compactionTimer?: NodeJS.Timeout
  private compactionPromise: Promise<void> | undefined
  private heartbeatTimer?: NodeJS.Timeout
  private heartbeatPromise: Promise<void> | undefined

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
    this.startedAt = Date.now()
  }

  static async create(config: Config): Promise<Master> {
    const sessionStore = await SessionStore.load(config.stateDir)
    const tasks = await loadTaskLedger(config.stateDir)
    const master = new Master(config, sessionStore, tasks)
    await master.recover()
    master.startAutoCompaction()
    master.startHeartbeat()
    master.startSelfImprove()
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

  getSession(sessionKey: string): SessionRecord | undefined {
    const trimmed = sessionKey.trim()
    if (!trimmed) return undefined
    return this.sessionStore.get(trimmed)
  }

  getStats(): {
    ok: boolean
    pid: number
    startedAt: string
    uptimeMs: number
    sessions: number
    activeSessions: number
    features: {
      selfImprove: boolean
      selfEvalPrompt: boolean
      selfEvalSkipSessions: number
      heartbeatIntervalMs: number
    }
    tasks: {
      total: number
      queued: number
      running: number
      done: number
      failed: number
    }
  } {
    const counts = this.countTasks()
    return {
      ok: true,
      pid: process.pid,
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeMs: Date.now() - this.startedAt,
      sessions: Object.keys(this.sessionStore.all()).length,
      activeSessions: this.queue.size,
      features: {
        selfImprove:
          Boolean(this.config.selfImprovePrompt?.trim()) &&
          this.config.selfImproveIntervalMs > 0,
        selfEvalPrompt: Boolean(this.config.selfEvalPrompt?.trim()),
        selfEvalSkipSessions: this.config.selfEvalSkipSessionKeys.length,
        heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      },
      tasks: counts,
    }
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
    const sessionKey = request.sessionKey.trim()
    if (!sessionKey) throw new Error('sessionKey is required')
    if (!request.prompt.trim()) throw new Error('prompt is required')
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
      sessionKey,
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

  private countTasks(): {
    total: number
    queued: number
    running: number
    done: number
    failed: number
  } {
    const counts = {
      total: this.tasks.size,
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
    }
    for (const task of this.tasks.values()) {
      switch (task.status) {
        case 'queued':
          counts.queued += 1
          break
        case 'running':
          counts.running += 1
          break
        case 'done':
          counts.done += 1
          break
        case 'failed':
          counts.failed += 1
          break
        default:
          break
      }
    }
    return counts
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

    run().catch((err) => console.error('compaction failed:', err))
    this.compactionTimer = setInterval(() => {
      run().catch((err) => console.error('compaction failed:', err))
    }, intervalMs)
    this.compactionTimer.unref()
  }

  private startHeartbeat(): void {
    if (this.config.heartbeatIntervalMs <= 0) return
    const intervalMs = this.config.heartbeatIntervalMs
    const write = async (): Promise<void> => {
      if (this.heartbeatPromise) return
      this.heartbeatPromise = (async () => {
        try {
          await writeJsonFileAtomic(this.config.heartbeatPath, {
            ...this.getStats(),
            updatedAt: new Date().toISOString(),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`heartbeat write failed: ${message}`)
        }
      })()
      try {
        await this.heartbeatPromise
      } finally {
        this.heartbeatPromise = undefined
      }
    }

    write().catch((err) => console.error('heartbeat failed:', err))
    this.heartbeatTimer = setInterval(() => {
      write().catch((err) => console.error('heartbeat failed:', err))
    }, intervalMs)
    this.heartbeatTimer.unref()
  }

  private startSelfImprove(): void {
    startSelfImprove({
      config: this.config,
      enqueueTask: this.enqueueTask.bind(this),
      isSessionBusy: (sessionKey) => this.hasActiveTasks(sessionKey),
    })
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
    kind: 'failed' | 'issue',
  ): Promise<void> {
    if (task.triggeredByTaskId) return
    const basePrompt =
      kind === 'failed'
        ? this.config.triggerOnFailurePrompt
        : this.config.triggerOnIssuePrompt
    const trimmedBase = basePrompt?.trim()
    if (!trimmedBase) return
    const lines = [
      trimmedBase,
      '',
      `Triggered by task ${task.id} (${task.sessionKey}).`,
      `Status: ${kind}`,
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
