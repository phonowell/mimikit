import crypto from 'node:crypto'

import { SessionStore } from '../session/store.js'

import { appendTaskRecord, loadTaskLedger, type TaskRecord } from './ledger.js'
import {
  normalizeGuardLimit,
  normalizeMaxIterations,
  normalizeMinScore,
  normalizeObjective,
  sanitizeScoreCommand,
  sanitizeVerifyCommand,
  trimText,
} from './master/helpers.js'
import { runTask } from './master/task-runner.js'
import { type MetricsSummary, summarizeMetrics } from './metrics.js'
import { Semaphore, SessionQueue } from './queue.js'

import type { Config, ResumePolicy } from '../config.js'

export type TaskRequest = {
  sessionKey: string
  prompt: string
  resume?: ResumePolicy
  verifyCommand?: string
  scoreCommand?: string
  minScore?: number
  objective?: string
  maxIterations?: number
  guardRequireClean?: boolean
  guardMaxChangedFiles?: number
  guardMaxChangedLines?: number
  triggeredByTaskId?: string
}

export class Master {
  private config: Config
  private sessionStore: SessionStore
  private tasks: Map<string, TaskRecord>
  private queue: SessionQueue
  private semaphore: Semaphore

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
    return master
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId)
  }

  getMetricsSummary(): Promise<MetricsSummary> {
    return summarizeMetrics(this.config.metricsPath)
  }

  async enqueueTask(request: TaskRequest): Promise<TaskRecord> {
    const taskId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const now = new Date().toISOString()
    const verifyCommand = sanitizeVerifyCommand(request.verifyCommand)
    const scoreCommand = sanitizeScoreCommand(request.scoreCommand)
    const minScore = normalizeMinScore(request.minScore)
    if (minScore !== undefined && !scoreCommand)
      throw new Error('minScore requires scoreCommand')
    const objective = normalizeObjective(request.objective)
    const guardRequireClean =
      request.guardRequireClean ?? this.config.guardRequireClean
    const guardMaxChangedFiles = normalizeGuardLimit(
      request.guardMaxChangedFiles ?? this.config.guardMaxChangedFiles,
      'guardMaxChangedFiles',
    )
    const guardMaxChangedLines = normalizeGuardLimit(
      request.guardMaxChangedLines ?? this.config.guardMaxChangedLines,
      'guardMaxChangedLines',
    )
    const needsIterations = Boolean(verifyCommand ?? minScore !== undefined)
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
      guardRequireClean,
    }
    const record: TaskRecord = {
      ...baseRecord,
      ...(verifyCommand ? { verifyCommand } : {}),
      ...(scoreCommand ? { scoreCommand } : {}),
      ...(minScore !== undefined ? { minScore } : {}),
      ...(objective ? { objective } : {}),
      ...(guardMaxChangedFiles !== undefined ? { guardMaxChangedFiles } : {}),
      ...(guardMaxChangedLines !== undefined ? { guardMaxChangedLines } : {}),
      ...(maxIterations !== undefined ? { maxIterations } : {}),
      ...(request.triggeredByTaskId
        ? { triggeredByTaskId: request.triggeredByTaskId }
        : {}),
    }

    await appendTaskRecord(this.config.stateDir, record)
    this.tasks.set(taskId, record)
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
    status: 'failed' | 'low-score',
  ): Promise<void> {
    if (task.triggeredByTaskId) return
    const basePrompt =
      status === 'low-score'
        ? this.config.triggerOnLowScorePrompt
        : this.config.triggerOnFailurePrompt
    const trimmedBase = basePrompt?.trim()
    if (!trimmedBase) return
    const lines = [
      trimmedBase,
      '',
      `Triggered by task ${task.id} (${task.sessionKey}).`,
      `Status: ${status}`,
      `Reason: ${trimText(reason, 800)}`,
    ]
    if (task.objective)
      lines.push(`Objective: ${trimText(task.objective, 800)}`)
    if (task.score !== undefined && task.minScore !== undefined)
      lines.push(`Score: ${task.score} (min ${task.minScore})`)
    const prompt = lines.join('\n')
    await this.enqueueTask({
      sessionKey: this.config.triggerSessionKey,
      prompt,
      resume: 'never',
      triggeredByTaskId: task.id,
    })
  }
}
