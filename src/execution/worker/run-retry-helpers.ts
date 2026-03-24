import { AbortError } from 'p-retry'

import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { incrementRuntimeTaskAttempts } from '../../work/orchestrator/task-state-write.js'
import { ProviderError } from '../providers/provider-error.js'

import { isAbortLikeError } from './error-utils.js'
import { isWorkerBudgetExceededError } from './profiled-runner-loop.js'
import { shouldResetSessionAfterError } from './session-state.js'

import type { Task } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Options, RetryContext } from 'p-retry'

const shouldTreatAsTaskCancel = (
  controller: AbortController,
  error: unknown,
): boolean => controller.signal.aborted && isAbortLikeError(error)

const shouldRetryTaskRun = (
  controller: AbortController,
  error: unknown,
): boolean =>
  !shouldTreatAsTaskCancel(controller, error) &&
  !(error instanceof ProviderError && !error.retryable) &&
  !isWorkerBudgetExceededError(error)

export const toRetryError = (error: unknown): Error => {
  if (error instanceof Error) return error
  return new Error(String(error))
}

export const toAbortRetryError = (
  controller: AbortController,
  error: unknown,
): unknown => {
  if (shouldTreatAsTaskCancel(controller, error))
    return new AbortError(controller.signal.reason ?? 'Task canceled')

  return toRetryError(error)
}

export const buildRetryOptions = (params: {
  runtime: WorkerRuntime
  task: Task
  retries: number
  backoffMs: number
  controller: AbortController
  onSessionDiscarded: (error: unknown) => Promise<void>
}): Options => {
  const { runtime, task, retries, backoffMs, controller, onSessionDiscarded } =
    params
  return {
    retries,
    factor: 1,
    minTimeout: backoffMs,
    maxTimeout: backoffMs,
    randomize: false,
    signal: controller.signal,
    shouldConsumeRetry: ({ error }) => shouldRetryTaskRun(controller, error),
    shouldRetry: ({ error }) => shouldRetryTaskRun(controller, error),
    onFailedAttempt: async (attemptError: RetryContext) => {
      if (!shouldRetryTaskRun(controller, attemptError.error)) return
      if (isWorkerBudgetExceededError(attemptError.error)) return
      if (shouldResetSessionAfterError(attemptError.error))
        await onSessionDiscarded(attemptError.error)
      if (attemptError.retriesLeft <= 0) return

      await appendLog(runtime.paths.log, {
        event: 'worker_retry',
        taskId: task.id,
        profile: task.profile,
        attempt: attemptError.attemptNumber,
        maxAttempts: retries + 1,
        backoffMs,
      })
      incrementRuntimeTaskAttempts({ runtime, taskId: task.id, task })
      await bestEffort('persistRuntimeState: worker_retry', () =>
        persistRuntimeState(runtime),
      )
    },
  }
}
