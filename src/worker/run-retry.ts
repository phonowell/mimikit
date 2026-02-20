import pRetry, { AbortError } from 'p-retry'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'

import { runSpecialistWorker, runStandardWorker } from './profiled-runner.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TokenUsage } from '../types/index.js'

export type WorkerLlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

const isAbortLikeError = (error: unknown): boolean => {
  if (error instanceof AbortError) return true
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || /aborted|canceled/i.test(error.message)
}

const shouldTreatAsTaskCancel = (
  controller: AbortController,
  error: unknown,
): boolean => controller.signal.aborted && isAbortLikeError(error)

const runStandardProfile = (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
  onUsage?: (usage: TokenUsage) => void
}): Promise<WorkerLlmResult> => {
  const { standard } = params.runtime.config.worker.profiles
  return runStandardWorker({
    stateDir: params.runtime.config.workDir,
    workDir: params.runtime.config.workDir,
    task: params.task,
    timeoutMs: standard.timeoutMs,
    model: standard.model,
    abortSignal: params.controller.signal,
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
  })
}

const runTaskByProfile = (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
  onUsage?: (usage: TokenUsage) => void
}): Promise<WorkerLlmResult> => {
  if (params.task.profile === 'deferred') {
    return Promise.resolve({
      output: params.task.prompt,
      elapsedMs: 0,
    })
  }
  if (params.task.profile === 'standard') {
    return runStandardProfile({
      runtime: params.runtime,
      task: params.task,
      controller: params.controller,
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    })
  }
  const { specialist } = params.runtime.config.worker.profiles
  return runSpecialistWorker({
    stateDir: params.runtime.config.workDir,
    workDir: params.runtime.config.workDir,
    task: params.task,
    timeoutMs: specialist.timeoutMs,
    model: specialist.model,
    modelReasoningEffort: specialist.modelReasoningEffort,
    abortSignal: params.controller.signal,
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
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
}): Parameters<typeof pRetry<WorkerLlmResult>>[1] => {
  const { runtime, task, retries, backoffMs, controller } = params
  return {
    retries,
    factor: 1,
    minTimeout: backoffMs,
    maxTimeout: backoffMs,
    randomize: false,
    signal: controller.signal,
    shouldConsumeRetry: ({ error }) =>
      !shouldTreatAsTaskCancel(controller, error),
    shouldRetry: ({ error }) => !shouldTreatAsTaskCancel(controller, error),
    onFailedAttempt: async (attemptError) => {
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
}): Promise<WorkerLlmResult> => {
  const { runtime, task, controller } = params
  const retries = Math.max(0, runtime.config.worker.retry.maxAttempts)
  const backoffMs = Math.max(0, runtime.config.worker.retry.backoffMs)
  const retryOptions = buildRetryOptions({
    runtime,
    task,
    retries,
    backoffMs,
    controller,
  })
  return pRetry(
    async () => {
      if (controller.signal.aborted)
        throw new AbortError(controller.signal.reason ?? 'Task canceled')
      try {
        return await runTaskByProfile({
          runtime,
          task,
          controller,
          ...(params.onUsage ? { onUsage: params.onUsage } : {}),
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
