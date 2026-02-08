import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { sleep } from '../shared/utils.js'
import { runWorker as runExpertWorker } from '../worker/expert-runner.js'
import { runStandardWorker as runStandardApiWorker } from '../worker/standard-runner.js'

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
  return runStandardApiWorker({
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

export const runTaskWithRetry = async (params: {
  runtime: RuntimeState
  task: Task
  controller: AbortController
}): Promise<WorkerLlmResult> => {
  const { runtime, task, controller } = params
  let llmResult: WorkerLlmResult | null = null
  const maxAttempts = Math.max(0, runtime.config.worker.retryMaxAttempts)
  const backoffMs = Math.max(0, runtime.config.worker.retryBackoffMs)
  let attempt = 0
  while (attempt <= maxAttempts) {
    try {
      llmResult = await runTaskByProfile({ runtime, task, controller })
      break
    } catch (error) {
      await appendWorkerRetryFeedback({ runtime, task, error })
      if (attempt >= maxAttempts) throw error
      await appendLog(runtime.paths.log, {
        event: 'worker_retry',
        taskId: task.id,
        profile: task.profile,
        attempt: attempt + 1,
        maxAttempts,
        backoffMs,
      })
      attempt += 1
      task.attempts = Math.max(0, (task.attempts ?? 0) + 1)
      await bestEffort('persistRuntimeState: worker_retry', () =>
        persistRuntimeState(runtime),
      )
      await sleep(backoffMs)
    }
  }
  if (!llmResult) throw new Error('worker_result_missing')
  return llmResult
}
