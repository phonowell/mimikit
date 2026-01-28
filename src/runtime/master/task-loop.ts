import { buildPrompt } from '../../agent/prompt.js'
import { type MemoryHit } from '../../memory/search.js'
import { acquireLock } from '../../session/lock.js'
import { type SessionRecord, type SessionStore } from '../../session/store.js'
import {
  appendTranscript,
  type TranscriptEntry,
} from '../../session/transcript.js'
import { appendTaskRecord, type TaskRecord } from '../ledger.js'
import { runSelfEvaluation } from '../self-eval.js'
import { runVerifyCommand } from '../verify.js'
import { runWorker } from '../worker.js'

import { buildRetryMessage, buildSummary, trimForEnv } from './helpers.js'
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
  maxIterations: number
  session: SessionRecord
  memoryHits: MemoryHit[]
  onTriggerFollowup?: (
    task: TaskRecord,
    reason: string,
    kind: 'failed' | 'issue',
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
  maxIterations,
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
  const summary = buildSummary(prompt)
  const summaryUpdate = summary ? { summary } : {}

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
      sessionStore.update(running.sessionKey, summaryUpdate)
      await sessionStore.flush()

      const issues: string[] = []

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
            },
          })
          if (!verifyResult.ok)
            verifyError = verifyResult.error ?? 'verify failed'
        } catch (error) {
          verifyError = error instanceof Error ? error.message : String(error)
        }

        if (verifyError) issues.push(`verify failed: ${verifyError}`)
      }

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
        sessionStore.update(running.sessionKey, summaryUpdate)
        await sessionStore.flush()
        if (onTriggerFollowup)
          await onTriggerFollowup(attemptRecord, message, 'failed')
        await failTask(
          config,
          tasks,
          attemptRecord,
          session,
          message,
          lockHeld,
          { skipTranscript: true },
        )
        return
      }

      const evaluation = await runSelfEvaluation({
        config,
        taskId: running.id,
        sessionKey: running.sessionKey,
        prompt,
        output: workerResult.output,
      })
      if (evaluation.verdict === 'issue' && onTriggerFollowup)
        await onTriggerFollowup(attemptRecord, evaluation.summary, 'issue')

      const done: TaskRecord = {
        ...attemptRecord,
        status: 'done',
        updatedAt: new Date().toISOString(),
        result: workerResult.output,
        evaluation: evaluation.evaluation,
      }
      const codexSessionId = workerResult.codexSessionId ?? existingSessionId
      if (codexSessionId !== undefined) done.codexSessionId = codexSessionId

      await appendTaskRecord(config.stateDir, done)
      tasks.set(running.id, done)
      return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (onTriggerFollowup)
      await onTriggerFollowup(currentRecord, message, 'failed')
    await failTask(config, tasks, currentRecord, session, message, lockHeld)
    sessionStore.update(currentRecord.sessionKey, summaryUpdate)
    await sessionStore.flush()
  } finally {
    if (releaseLock) await releaseLock()
  }
}
