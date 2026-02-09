import pRetry, { AbortError } from 'p-retry'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { runExpertWorker } from '../worker/expert-runner.js'
import { runStandardWorker } from '../worker/standard-runner.js'

import { persistRuntimeState } from './runtime-persist.js'
import { appendWorkerRetryFeedback } from './worker-run-feedback.js'

import type { RuntimeState } from './runtime-state.js'
import type { Task, TokenUsage } from '../types/index.js'

export type WorkerLlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

const runStandardProfile = async (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
}): Promise<WorkerLlmResult> => {
  const { standard } = params.runtime.config.worker
  const prompt = await buildWorkerPrompt({
    workDir: params.runtime.config.workDir,
    task: params.task,
  })
  return runStandardWorker({
    stateDir: params.runtime.config.stateDir,
    workDir: params.runtime.config.workDir,
    taskId: params.task.id,
    prompt,
    timeoutMs: standard.timeoutMs,
    model: standard.model,
    modelReasoningEffort: standard.modelReasoningEffort,
    abortSignal: params.controller.signal,
  })
}

const runTaskByProfile = (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
}): Promise<WorkerLlmResult> => {
  if (params.task.profile === 'standard') {
    return runStandardProfile({
      runtime: params.runtime,
      task: params.task,
      controller: params.controller,
    })
  }
  const { expert } = params.runtime.config.worker
  return runExpertWorker({
    stateDir: params.runtime.config.stateDir,
    workDir: params.runtime.config.workDir,
    task: params.task,
    timeoutMs: expert.timeoutMs,
    model: expert.model,
    modelReasoningEffort: expert.modelReasoningEffort,
    abortSignal: params.controller.signal,
  })
}

const toRetryError = (error: unknown): Error => {
  if (error instanceof Error) return error
  return new Error(String(error))
}

export const runTaskWithRetry = (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
}): Promise<WorkerLlmResult> => {
  const { runtime, task, controller } = params
  const retries = Math.max(0, runtime.config.worker.retryMaxAttempts)
  const backoffMs = Math.max(0, runtime.config.worker.retryBackoffMs)
  return pRetry(
    async () => {
      if (controller.signal.aborted)
        throw new AbortError(controller.signal.reason ?? 'Task canceled')
      try {
        return await runTaskByProfile({ runtime, task, controller })
      } catch (error) {
        if (controller.signal.aborted)
          throw new AbortError(controller.signal.reason ?? 'Task canceled')
        throw toRetryError(error)
      }
    },
    {
      retries,
      factor: 1,
      minTimeout: backoffMs,
      maxTimeout: backoffMs,
      randomize: false,
      signal: controller.signal,
      shouldRetry: ({ error }) => !(error instanceof AbortError),
      onFailedAttempt: async (attemptError) => {
        await appendWorkerRetryFeedback({
          runtime,
          task,
          error: attemptError.error,
        })
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
    },
  )
}
