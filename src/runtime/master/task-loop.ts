import { buildPrompt } from '../../agent/prompt.js'
import { appendLesson } from '../../memory/lessons.js'
import { type MemoryHit } from '../../memory/search.js'
import { acquireLock } from '../../session/lock.js'
import { type SessionRecord, type SessionStore } from '../../session/store.js'
import {
  appendTranscript,
  type TranscriptEntry,
} from '../../session/transcript.js'
import { type DiffSummary, getDiffSummary, isCleanRepo } from '../git.js'
import { appendTaskRecord, type TaskRecord } from '../ledger.js'
import { appendMetric } from '../metrics.js'
import { runVerifyCommand } from '../verify.js'
import { runWorker } from '../worker.js'

import { buildRetryMessage, parseScoreOutput, trimForEnv } from './helpers.js'
import { failTask } from './task-failure.js'

import type { Config, ResumePolicy } from '../../config.js'

export type TaskLoopParams = {
  config: Config
  sessionStore: SessionStore
  tasks: Map<string, TaskRecord>
  running: TaskRecord
  prompt: string
  resumePolicy: ResumePolicy
  existingSessionId?: string
  verifyCommand?: string
  scoreCommand?: string
  minScore?: number
  objective?: string
  guardRequireClean?: boolean
  guardMaxChangedFiles?: number
  guardMaxChangedLines?: number
  maxIterations: number
  startedAtMs: number
  startedAtIso: string
  session: SessionRecord
  memoryHits: MemoryHit[]
  onTriggerFollowup?: (
    task: TaskRecord,
    reason: string,
    status: 'failed' | 'low-score',
  ) => Promise<void>
}

export const runTaskLoop = async ({
  config,
  sessionStore,
  tasks,
  running,
  prompt,
  resumePolicy,
  existingSessionId: existingSessionIdParam,
  verifyCommand,
  scoreCommand,
  minScore,
  objective,
  guardRequireClean,
  guardMaxChangedFiles,
  guardMaxChangedLines,
  maxIterations,
  startedAtMs,
  startedAtIso,
  session,
  memoryHits,
  onTriggerFollowup,
}: TaskLoopParams): Promise<void> => {
  let existingSessionId = existingSessionIdParam
  const lockTimeoutMs = config.timeoutMs + 30_000
  let releaseLock: (() => Promise<void>) | undefined
  let lockHeld = false
  let attempt = running.attempt ?? 0
  let userMessage = prompt
  let currentRecord = running
  let metricRecorded = false
  let lastOutput: string | undefined
  let lastScore: number | undefined
  let lastDiffSummary: DiffSummary | undefined

  const recordMetric = async (params: {
    status: 'done' | 'failed'
    attempt: number
    error?: string
    diffSummary?: DiffSummary
    score?: number
  }): Promise<void> => {
    if (metricRecorded) return
    const finishedAt = new Date()
    const diffSummary = params.diffSummary ?? lastDiffSummary
    const score = params.score ?? lastScore
    const record = {
      taskId: running.id,
      runId: running.runId,
      sessionKey: running.sessionKey,
      status: params.status,
      attempt: params.attempt,
      startedAt: startedAtIso,
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAtMs,
      ...(score !== undefined ? { score } : {}),
      ...(minScore !== undefined ? { minScore } : {}),
      ...(diffSummary
        ? {
            changedFiles: diffSummary.changedFiles,
            changedLines: diffSummary.total,
          }
        : {}),
      ...(params.error !== undefined ? { error: params.error } : {}),
    }
    await appendMetric(config.metricsPath, record)
    metricRecorded = true
  }

  const recordLesson = async (params: {
    status: 'failed' | 'low-score'
    reason: string
    output?: string
  }): Promise<void> => {
    if (!config.lessonsEnabled) return
    const entry = {
      ts: new Date().toISOString(),
      taskId: running.id,
      sessionKey: running.sessionKey,
      status: params.status,
      reason: params.reason,
      prompt,
      ...(params.output !== undefined ? { output: params.output } : {}),
      ...(objective ? { objective } : {}),
      ...(lastScore !== undefined ? { score: lastScore } : {}),
      ...(minScore !== undefined ? { minScore } : {}),
    }
    await appendLesson(config.lessonsPath, entry)
  }

  if (guardRequireClean) {
    const clean = await isCleanRepo(config.workspaceRoot, config.timeoutMs)
    if (!clean) {
      const message = 'guardRequireClean failed: working tree is dirty'
      await recordMetric({ status: 'failed', attempt, error: message })
      await recordLesson({ status: 'failed', reason: message })
      if (onTriggerFollowup) await onTriggerFollowup(running, message, 'failed')
      await failTask(config, tasks, running, session, message, false)
      return
    }
  }

  try {
    releaseLock = await acquireLock(session.transcriptPath, lockTimeoutMs)
    lockHeld = true
    while (attempt < maxIterations) {
      const attemptNumber = attempt + 1
      lastScore = undefined
      const attemptRecord: TaskRecord = {
        ...running,
        attempt: attemptNumber,
        updatedAt: new Date().toISOString(),
      }
      currentRecord = attemptRecord
      await appendTaskRecord(config.stateDir, attemptRecord)
      tasks.set(running.id, attemptRecord)

      const finalPrompt = buildPrompt({
        sessionKey: running.sessionKey,
        userMessage,
        memoryHits,
        outputPolicy: config.outputPolicy,
      })

      const workerResult = await runWorker({
        config,
        prompt: finalPrompt,
        resumePolicy,
        ...(resumePolicy !== 'never' && existingSessionId
          ? { resumeSessionId: existingSessionId }
          : {}),
      })

      lastOutput = workerResult.output

      if (workerResult.codexSessionId) {
        existingSessionId = workerResult.codexSessionId
        sessionStore.update(running.sessionKey, {
          codexSessionId: workerResult.codexSessionId,
        })
        await sessionStore.flush()
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

      const needsDiff =
        guardMaxChangedFiles !== undefined || guardMaxChangedLines !== undefined
      let diffSummary: DiffSummary | undefined
      if (needsDiff) {
        const currentDiffSummary = await getDiffSummary(
          config.workspaceRoot,
          config.timeoutMs,
        )
        diffSummary = currentDiffSummary
        lastDiffSummary = currentDiffSummary
        const guardIssues: string[] = []
        if (
          guardMaxChangedFiles !== undefined &&
          currentDiffSummary.changedFiles > guardMaxChangedFiles
        ) {
          guardIssues.push(
            `changedFiles ${currentDiffSummary.changedFiles} > guardMaxChangedFiles ${guardMaxChangedFiles}`,
          )
        }
        if (
          guardMaxChangedLines !== undefined &&
          currentDiffSummary.total > guardMaxChangedLines
        ) {
          guardIssues.push(
            `changedLines ${currentDiffSummary.total} > guardMaxChangedLines ${guardMaxChangedLines}`,
          )
        }
        if (guardIssues.length > 0) {
          const message = `guard failed: ${guardIssues.join('; ')}`
          const guardRecord: TaskRecord = {
            ...attemptRecord,
            changedFiles: currentDiffSummary.changedFiles,
            changedLines: currentDiffSummary.total,
          }
          currentRecord = guardRecord
          const guardEntry: TranscriptEntry = {
            type: 'message',
            role: 'assistant',
            text: message,
            ts: new Date().toISOString(),
            sessionKey: running.sessionKey,
            runId: running.runId,
            error: message,
          }
          await appendTranscript(session.transcriptPath, [guardEntry])
          await recordMetric({
            status: 'failed',
            attempt: attemptNumber,
            error: message,
            diffSummary: currentDiffSummary,
          })
          await recordLesson({
            status: 'failed',
            reason: message,
            output: lastOutput,
          })
          if (onTriggerFollowup)
            await onTriggerFollowup(guardRecord, message, 'failed')
          await failTask(
            config,
            tasks,
            guardRecord,
            session,
            message,
            lockHeld,
            { skipTranscript: true },
          )
          return
        }
      }

      const issues: string[] = []
      let lowScoreFailure = false
      let score: number | undefined
      let scoreSummary: string | undefined

      if (verifyCommand) {
        let verifyError: string | undefined
        try {
          const verifyResult = await runVerifyCommand(verifyCommand, {
            cwd: config.workspaceRoot,
            timeoutMs: config.timeoutMs,
            env: {
              MIMIKIT_TASK_ID: running.id,
              MIMIKIT_SESSION_KEY: running.sessionKey,
              MIMIKIT_ATTEMPT: String(attemptNumber),
              MIMIKIT_MAX_ITERATIONS: String(maxIterations),
              MIMIKIT_LAST_OUTPUT: trimForEnv(workerResult.output, 4000),
              MIMIKIT_OBJECTIVE: objective ?? '',
            },
          })
          if (!verifyResult.ok)
            verifyError = verifyResult.error ?? 'verify failed'
        } catch (error) {
          verifyError = error instanceof Error ? error.message : String(error)
        }

        if (verifyError) issues.push(`verify failed: ${verifyError}`)
      }

      if (scoreCommand) {
        let scoreIssue: string | undefined
        try {
          const scoreResult = await runVerifyCommand(scoreCommand, {
            cwd: config.workspaceRoot,
            timeoutMs: config.timeoutMs,
            env: {
              MIMIKIT_TASK_ID: running.id,
              MIMIKIT_SESSION_KEY: running.sessionKey,
              MIMIKIT_ATTEMPT: String(attemptNumber),
              MIMIKIT_MAX_ITERATIONS: String(maxIterations),
              MIMIKIT_LAST_OUTPUT: trimForEnv(workerResult.output, 4000),
              MIMIKIT_OBJECTIVE: objective ?? '',
            },
          })
          const source =
            scoreResult.stdout.length > 0
              ? scoreResult.stdout
              : scoreResult.stderr
          const parsed = parseScoreOutput(source)
          scoreSummary = parsed.summary
          if (!scoreResult.ok)
            scoreIssue = scoreResult.error ?? 'scoreCommand failed'
          else if (parsed.score === undefined) scoreIssue = 'score parse failed'
          else score = parsed.score

          if (
            score !== undefined &&
            minScore !== undefined &&
            score < minScore
          ) {
            scoreIssue = `score ${score} below minScore ${minScore}`
            lowScoreFailure = true
          }
        } catch (error) {
          scoreIssue = error instanceof Error ? error.message : String(error)
        }

        if (scoreIssue) issues.push(scoreIssue)
      }

      lastScore = score
      const recordWithMetrics: TaskRecord = {
        ...attemptRecord,
        ...(diffSummary
          ? {
              changedFiles: diffSummary.changedFiles,
              changedLines: diffSummary.total,
            }
          : {}),
        ...(score !== undefined ? { score } : {}),
        ...(scoreSummary ? { scoreSummary } : {}),
      }
      currentRecord = recordWithMetrics

      if (issues.length > 0) {
        if (attemptNumber < maxIterations) {
          userMessage = buildRetryMessage({
            prompt,
            output: workerResult.output,
            attempt: attemptNumber,
            maxIterations,
            issues,
          })
          attempt = attemptNumber
          continue
        }

        const message = issues.join(' | ')
        const failureStatus =
          lowScoreFailure && issues.length === 1 ? 'low-score' : 'failed'
        const issueEntry: TranscriptEntry = {
          type: 'message',
          role: 'assistant',
          text: message,
          ts: new Date().toISOString(),
          sessionKey: running.sessionKey,
          runId: running.runId,
          error: message,
        }
        await appendTranscript(session.transcriptPath, [issueEntry])
        await recordMetric({
          status: 'failed',
          attempt: attemptNumber,
          error: message,
          ...(diffSummary ? { diffSummary } : {}),
          ...(score !== undefined ? { score } : {}),
        })
        await recordLesson({
          status: failureStatus,
          reason: message,
          output: lastOutput,
        })
        if (onTriggerFollowup)
          await onTriggerFollowup(recordWithMetrics, message, failureStatus)
        await failTask(
          config,
          tasks,
          recordWithMetrics,
          session,
          message,
          lockHeld,
          { skipTranscript: true },
        )
        return
      }

      const done: TaskRecord = {
        ...recordWithMetrics,
        status: 'done',
        updatedAt: new Date().toISOString(),
        result: workerResult.output,
      }
      const codexSessionId = workerResult.codexSessionId ?? existingSessionId
      if (codexSessionId !== undefined) done.codexSessionId = codexSessionId

      await appendTaskRecord(config.stateDir, done)
      tasks.set(running.id, done)
      await recordMetric({
        status: 'done',
        attempt: attemptNumber,
        ...(diffSummary ? { diffSummary } : {}),
        ...(score !== undefined ? { score } : {}),
      })
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await recordMetric({
      status: 'failed',
      attempt: currentRecord.attempt ?? attempt,
      error: message,
    })
    await recordLesson({
      status: 'failed',
      reason: message,
      ...(lastOutput !== undefined ? { output: lastOutput } : {}),
    })
    if (onTriggerFollowup)
      await onTriggerFollowup(currentRecord, message, 'failed')
    await failTask(config, tasks, currentRecord, session, message, lockHeld)
  } finally {
    if (releaseLock) await releaseLock()
  }
}
