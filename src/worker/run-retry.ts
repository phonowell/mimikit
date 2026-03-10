import pRetry, { AbortError } from 'p-retry'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { ProviderError } from '../providers/provider-error.js'

import { isAbortLikeError } from './error-utils.js'
import { isWorkerBudgetExceededError } from './profiled-runner-loop.js'
import { runWorker } from './profiled-runner.js'
import {
  discardTaskSession,
  selectReusableSessionId,
  setTaskSessionReusable,
  shouldResetSessionAfterError,
} from './session-state.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskFocusBrief } from '../prompts/format-task-focus-brief.js'
import type { Task, TokenUsage, WorkerProvider } from '../types/index.js'

export type WorkerLlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

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

const buildTaskFocusBrief = (
  runtime: RuntimeState,
  task: Task,
): TaskFocusBrief | undefined => {
  const focusMeta = runtime.focuses.find((focus) => focus.id === task.focusId)
  const focusDigest = runtime.focusDigests.find(
    (digest) => digest.focusId === task.focusId,
  )
  if (!focusMeta && !focusDigest) return undefined
  return {
    focusId: task.focusId,
    ...(focusMeta?.title ? { title: focusMeta.title } : {}),
    ...(focusDigest?.summary ? { summary: focusDigest.summary } : {}),
    ...(focusDigest?.openItems ? { openItems: focusDigest.openItems } : {}),
    ...(focusDigest?.updatedAt
      ? { updatedAt: focusDigest.updatedAt }
      : focusMeta?.updatedAt
        ? { updatedAt: focusMeta.updatedAt }
        : {}),
    ...(focusMeta?.lastActivityAt
      ? { lastActivityAt: focusMeta.lastActivityAt }
      : {}),
  }
}

const runTaskModel = (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
  sessionId?: string
  onSessionId?: (sessionId: string) => Promise<void>
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
}): Promise<WorkerLlmResult> => {
  const { worker, codex, opencode } = params.runtime.config
  const taskProvider: WorkerProvider = params.task.provider
  const providerConfig =
    taskProvider === 'opencode'
      ? {
          enabled: opencode.enabled,
          model: opencode.model,
          proxy: opencode.proxy,
        }
      : {
          enabled: codex.enabled,
          model: codex.model,
          proxy: codex.proxy,
          modelReasoningEffort: codex.modelReasoningEffort,
        }
  if (!providerConfig.enabled) {
    throw new Error(
      `[worker] ${taskProvider} provider is disabled: set ${taskProvider}.enabled=true`,
    )
  }

  const focusBrief = buildTaskFocusBrief(params.runtime, params.task)
  return runWorker({
    provider: taskProvider,
    runtimeId: params.runtime.runtimeId,
    stateDir: params.runtime.config.workDir,
    cwd: params.task.cwd,
    task: params.task,
    ...(focusBrief ? { focusBrief } : {}),
    timeoutMs: worker.timeoutMs,
    ...(providerConfig.proxy ? { proxy: providerConfig.proxy } : {}),
    model: providerConfig.model,
    ...(taskProvider === 'codex' && providerConfig.modelReasoningEffort
      ? { modelReasoningEffort: providerConfig.modelReasoningEffort }
      : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    abortSignal: params.controller.signal,
    ...(params.onSessionId ? { onSessionId: params.onSessionId } : {}),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.onPartialOutput
      ? { onPartialOutput: params.onPartialOutput }
      : {}),
    budget: worker.budget,
  })
}

const toRetryError = (error: unknown): Error => {
  if (error instanceof Error) return error
  return new Error(String(error))
}

const buildRetryOptions = (params: {
  runtime: RuntimeState
  task: Task
  retries: number
  backoffMs: number
  controller: AbortController
  onSessionDiscarded: (error: unknown) => Promise<void>
}): Parameters<typeof pRetry<WorkerLlmResult>>[1] => {
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
    onFailedAttempt: async (attemptError) => {
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
      task.attempts = Math.max(0, (task.attempts ?? 0) + 1)
      await bestEffort('persistRuntimeState: worker_retry', () =>
        persistRuntimeState(runtime),
      )
    },
  }
}

export const runTaskWithRetry = (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
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
    if (!setTaskSessionReusable(task, sessionId)) return
    await persistSessionState('worker_session_bound', { sessionId })
  }

  const onSessionDiscarded = async (error: unknown): Promise<void> => {
    if (!discardTaskSession(task)) return
    const message = error instanceof Error ? error.message : String(error)
    await persistSessionState('worker_session_discarded', {
      reason: 'session_resume_invalid',
      error: message,
    })
  }

  const retries = Math.max(0, runtime.config.worker.retry.maxAttempts)
  const backoffMs = Math.max(0, runtime.config.worker.retry.backoffMs)
  const retryOptions = buildRetryOptions({
    runtime,
    task,
    retries,
    backoffMs,
    controller,
    onSessionDiscarded,
  })
  let attempt = 0
  return pRetry(
    async () => {
      attempt += 1
      if (controller.signal.aborted)
        throw new AbortError(controller.signal.reason ?? 'Task canceled')
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
          onSessionId,
          ...(params.onUsage ? { onUsage: params.onUsage } : {}),
          ...(params.onPartialOutput
            ? { onPartialOutput: params.onPartialOutput }
            : {}),
        })
      } catch (error) {
        if (shouldTreatAsTaskCancel(controller, error))
          throw new AbortError(controller.signal.reason ?? 'Task canceled')
        throw toRetryError(error)
      }
    },
    {
      ...retryOptions,
    },
  )
}
