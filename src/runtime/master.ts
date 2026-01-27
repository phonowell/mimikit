import crypto from 'node:crypto'

import { buildPrompt } from '../agent/prompt.js'
import { searchMemory } from '../memory/search.js'
import { acquireLock } from '../session/lock.js'
import { type SessionRecord, SessionStore } from '../session/store.js'
import {
  appendTranscript,
  type TranscriptEntry,
} from '../session/transcript.js'

import { appendTaskRecord, loadTaskLedger, type TaskRecord } from './ledger.js'
import { Semaphore, SessionQueue } from './queue.js'
import { runVerifyCommand } from './verify.js'
import { runWorker } from './worker.js'

import type { Config, ResumePolicy } from '../config.js'

export type TaskRequest = {
  sessionKey: string
  prompt: string
  resume?: ResumePolicy
  verifyCommand?: string
  maxIterations?: number
}

const sanitizeVerifyCommand = (
  value: string | undefined,
): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.includes('\n') || trimmed.includes('\r'))
    throw new Error('verifyCommand must be a single line')
  return trimmed
}

const normalizeMaxIterations = (
  value: number | undefined,
  fallback: number,
): number => {
  const candidate = Number.isFinite(value) ? (value as number) : fallback
  const rounded = Math.floor(candidate)
  return rounded >= 1 ? rounded : 1
}

const trimForEnv = (value: string, limit: number): string =>
  value.length > limit ? value.slice(0, limit) : value

const buildRetryMessage = (params: {
  prompt: string
  output: string
  verifyError: string
  attempt: number
  maxIterations: number
}): string =>
  [
    params.prompt.trim(),
    '',
    `Previous output (attempt ${params.attempt} of ${params.maxIterations}):`,
    params.output.trim(),
    '',
    'Verification failed:',
    params.verifyError.trim(),
    '',
    'Fix the issues and respond with the corrected output only.',
  ].join('\n')

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

  async enqueueTask(request: TaskRequest): Promise<TaskRecord> {
    const taskId = crypto.randomUUID()
    const runId = crypto.randomUUID()
    const now = new Date().toISOString()
    const verifyCommand = sanitizeVerifyCommand(request.verifyCommand)
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
    const record: TaskRecord = verifyCommand
      ? {
          ...baseRecord,
          verifyCommand,
          maxIterations: normalizeMaxIterations(
            request.maxIterations,
            this.config.maxIterations,
          ),
        }
      : baseRecord

    await appendTaskRecord(this.config.stateDir, record)
    this.tasks.set(taskId, record)
    this.enqueueRecord(record)
    return record
  }

  private enqueueRecord(record: TaskRecord): void {
    void this.queue.enqueue(record.sessionKey, async () => {
      const release = await this.semaphore.acquire()
      try {
        await this.runTask(record.id)
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

  private async runTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (task?.status !== 'queued' || task.prompt === undefined) return
    const { prompt } = task

    const now = new Date().toISOString()
    const trimmedVerifyCommand = task.verifyCommand?.trim()
    const verifyCommand =
      trimmedVerifyCommand && trimmedVerifyCommand.length > 0
        ? trimmedVerifyCommand
        : undefined
    const maxIterations = verifyCommand
      ? normalizeMaxIterations(task.maxIterations, this.config.maxIterations)
      : 1
    const {
      verifyCommand: _verifyCommand,
      maxIterations: _maxIterations,
      ...taskBase
    } = task
    const runningBase: TaskRecord = {
      ...taskBase,
      status: 'running',
      updatedAt: now,
      attempt: task.attempt ?? 0,
    }
    const running: TaskRecord = verifyCommand
      ? { ...runningBase, verifyCommand, maxIterations }
      : runningBase
    await appendTaskRecord(this.config.stateDir, running)
    this.tasks.set(taskId, running)

    const session = this.sessionStore.ensure(running.sessionKey)
    await this.sessionStore.flush()

    const resumePolicy = running.resume
    let existingSessionId = session.codexSessionId
    if (resumePolicy === 'always' && !existingSessionId) {
      await this.failTask(
        running,
        session,
        'resume=always requires a sessionId, but none was found',
        false,
      )
      return
    }

    const memoryHits = await searchMemory(this.config, prompt)
    const lockTimeoutMs = this.config.timeoutMs + 30_000
    let releaseLock: (() => Promise<void>) | undefined
    let lockHeld = false
    let attempt = running.attempt ?? 0
    let userMessage = prompt
    let currentRecord = running
    try {
      releaseLock = await acquireLock(session.transcriptPath, lockTimeoutMs)
      lockHeld = true
      while (attempt < maxIterations) {
        const attemptNumber = attempt + 1
        const attemptRecord: TaskRecord = {
          ...running,
          attempt: attemptNumber,
          updatedAt: new Date().toISOString(),
        }
        currentRecord = attemptRecord
        await appendTaskRecord(this.config.stateDir, attemptRecord)
        this.tasks.set(taskId, attemptRecord)

        const finalPrompt = buildPrompt({
          sessionKey: running.sessionKey,
          userMessage,
          memoryHits,
          outputPolicy: this.config.outputPolicy,
        })

        const workerResult = await runWorker({
          config: this.config,
          prompt: finalPrompt,
          resumePolicy,
          ...(resumePolicy !== 'never' && existingSessionId
            ? { resumeSessionId: existingSessionId }
            : {}),
        })

        if (workerResult.codexSessionId) {
          existingSessionId = workerResult.codexSessionId
          this.sessionStore.update(running.sessionKey, {
            codexSessionId: workerResult.codexSessionId,
          })
          await this.sessionStore.flush()
        }

        const transcriptEntries: TranscriptEntry[] = [
          {
            type: 'message',
            role: 'user',
            text: userMessage,
            ts: new Date().toISOString(),
            sessionKey: running.sessionKey,
            runId: running.runId,
          },
          {
            type: 'message',
            role: 'assistant',
            text: workerResult.output,
            ts: new Date().toISOString(),
            sessionKey: running.sessionKey,
            runId: running.runId,
          },
        ]

        await appendTranscript(session.transcriptPath, transcriptEntries)

        if (verifyCommand) {
          let verifyError: string | undefined
          try {
            const verifyResult = await runVerifyCommand(verifyCommand, {
              cwd: this.config.workspaceRoot,
              timeoutMs: this.config.timeoutMs,
              env: {
                MIMIKIT_TASK_ID: running.id,
                MIMIKIT_SESSION_KEY: running.sessionKey,
                MIMIKIT_ATTEMPT: String(attemptNumber),
                MIMIKIT_MAX_ITERATIONS: String(maxIterations),
                MIMIKIT_LAST_OUTPUT: trimForEnv(workerResult.output, 4000),
              },
            })
            if (!verifyResult.ok)
              verifyError = verifyResult.error ?? 'verify failed'
          } catch (error) {
            verifyError = error instanceof Error ? error.message : String(error)
          }

          if (verifyError) {
            if (attemptNumber < maxIterations) {
              userMessage = buildRetryMessage({
                prompt,
                output: workerResult.output,
                verifyError,
                attempt: attemptNumber,
                maxIterations,
              })
              attempt = attemptNumber
              continue
            }

            const verifyEntry: TranscriptEntry = {
              type: 'message',
              role: 'assistant',
              text: `Verification failed: ${verifyError}`,
              ts: new Date().toISOString(),
              sessionKey: running.sessionKey,
              runId: running.runId,
              error: verifyError,
            }
            await appendTranscript(session.transcriptPath, [verifyEntry])
            await this.failTask(
              attemptRecord,
              session,
              `verify failed: ${verifyError}`,
              lockHeld,
              { skipTranscript: true },
            )
            return
          }
        }

        const done: TaskRecord = {
          ...attemptRecord,
          status: 'done',
          updatedAt: new Date().toISOString(),
          result: workerResult.output,
        }
        const codexSessionId = workerResult.codexSessionId ?? existingSessionId
        if (codexSessionId !== undefined) done.codexSessionId = codexSessionId

        await appendTaskRecord(this.config.stateDir, done)
        this.tasks.set(taskId, done)
        return
      }
    } catch (error) {
      await this.failTask(
        currentRecord,
        session,
        error instanceof Error ? error.message : String(error),
        lockHeld,
      )
    } finally {
      if (releaseLock) await releaseLock()
    }
  }

  private async failTask(
    task: TaskRecord,
    session: SessionRecord,
    message: string,
    lockHeld: boolean,
    options?: { skipTranscript?: boolean },
  ): Promise<void> {
    const failed: TaskRecord = {
      ...task,
      status: 'failed',
      updatedAt: new Date().toISOString(),
      result: message,
    }

    await appendTaskRecord(this.config.stateDir, failed)
    this.tasks.set(task.id, failed)

    if (!options?.skipTranscript) {
      const lockTimeoutMs = this.config.timeoutMs + 30_000
      let release: (() => Promise<void>) | undefined
      let canWrite = lockHeld
      if (!lockHeld) {
        try {
          release = await acquireLock(session.transcriptPath, lockTimeoutMs)
          canWrite = true
        } catch {
          canWrite = false
        }
      }

      if (canWrite) {
        const prompt = task.prompt ?? ''
        const entries: TranscriptEntry[] = [
          {
            type: 'message',
            role: 'user',
            text: prompt,
            ts: new Date().toISOString(),
            sessionKey: task.sessionKey,
            runId: task.runId,
          },
          {
            type: 'message',
            role: 'assistant',
            text: message,
            ts: new Date().toISOString(),
            sessionKey: task.sessionKey,
            runId: task.runId,
            error: message,
          },
        ]
        await appendTranscript(session.transcriptPath, entries)
      }

      if (release) await release()
    }
  }
}
