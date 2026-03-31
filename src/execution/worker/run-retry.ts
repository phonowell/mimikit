import pRetry, { AbortError } from 'p-retry'

import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  bindRuntimeTaskSession,
  discardRuntimeTaskSession,
} from '../../work/orchestrator/task-session-write.js'

import { buildRetryOptions, toAbortRetryError } from './run-retry-helpers.js'
import { runTaskModel, type WorkerLlmResult } from './run-retry-model.js'
import { selectReusableSessionId } from './session-state.js'
import { assertTaskCwdAvailableForAttempt } from './task-cwd-preflight.js'

import type { Task, TokenUsage } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type { WorkerLlmResult } from './run-retry-model.js'

export const runTaskWithRetry = (params: {
  runtime: WorkerRuntime
  task: Task
  controller: AbortController
  onTurnStarted?: () => void
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
}): Promise<WorkerLlmResult> => {
  const { runtime, task, controller } = params
  const persistSessionState = async (
    event: 'worker_session_bound' | 'worker_session_discarded',
    extra?: Record<string, unknown>,
  ): Promise<void> => {
    await bestEffort(`appendLog: ${event}`, () =>
      appendLog(runtime.paths.log, {
        event,
        taskId: task.id,
        ...(extra ?? {}),
      }),
    )
    await bestEffort(`persistRuntimeState: ${event}`, () =>
      persistRuntimeState(runtime),
    )
  }

  const onSessionId = async (sessionId: string): Promise<void> => {
    if (!bindRuntimeTaskSession({ runtime, taskId: task.id, sessionId, task }))
      return
    await persistSessionState('worker_session_bound', { sessionId })
  }

  const onSessionDiscarded = async (error: unknown): Promise<void> => {
    if (!discardRuntimeTaskSession({ runtime, taskId: task.id, task })) return
    const message = error instanceof Error ? error.message : String(error)
    await persistSessionState('worker_session_discarded', {
      reason: 'session_resume_invalid',
      error: message,
    })
  }

  const retries = Math.max(0, runtime.config.worker.retry.maxAttempts)
  const backoffMs = Math.max(0, runtime.config.worker.retry.backoffMs)
  const resumeInstruction = task.resumeInstruction?.trim() ?? undefined
  const retryOptions = buildRetryOptions({
    runtime,
    task,
    retries,
    backoffMs,
    controller,
    onSessionDiscarded,
  })
  let attempt = 0
  return pRetry(async () => {
    attempt += 1
    if (controller.signal.aborted)
      throw new AbortError(controller.signal.reason ?? 'Task canceled')
    assertTaskCwdAvailableForAttempt({
      taskId: task.id,
      cwd: task.cwd,
      attempt,
      providerId: 'codex-sdk',
    })
    const sessionId = selectReusableSessionId(task)
    if (sessionId) {
      await bestEffort('appendLog: worker_session_reuse_attempt', () =>
        appendLog(runtime.paths.log, {
          event: 'worker_session_reuse_attempt',
          taskId: task.id,
          attempt,
          sessionId,
        }),
      )
    }
    try {
      return await runTaskModel({
        runtime,
        task,
        controller,
        ...(sessionId ? { sessionId } : {}),
        ...(resumeInstruction ? { resumeInstruction } : {}),
        onSessionId,
        ...(params.onTurnStarted
          ? { onTurnStarted: params.onTurnStarted }
          : {}),
        ...(params.onUsage ? { onUsage: params.onUsage } : {}),
        ...(params.onPartialOutput
          ? { onPartialOutput: params.onPartialOutput }
          : {}),
      })
    } catch (error) {
      throw toAbortRetryError(controller, error)
    }
  }, retryOptions)
}
