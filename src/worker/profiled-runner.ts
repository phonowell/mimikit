import { buildWorkerPrompt } from '../prompts/build-prompts.js'

import {
  appendProfileProgress,
  archiveWorkerResult,
  buildRunModel,
} from './profiled-runner-helpers.js'

import type {
  LlmResult,
  WorkerProfile,
  WorkerProvider,
} from './profiled-runner-helpers.js'
import type { Task } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export const runProfiledWorker = async (params: {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  provider: WorkerProvider
  profile: WorkerProfile
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}): Promise<LlmResult> => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
  })
  const base = {
    role: 'worker' as const,
    taskId: params.task.id,
    ...(params.model ? { model: params.model } : {}),
  }
  const runModel = buildRunModel(params)
  await appendProfileProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    profile: params.profile,
    phase: 'start',
    payload: {},
  })

  try {
    const result = await runModel(prompt)
    if (result.usage) params.task.usage = result.usage
    await appendProfileProgress({
      stateDir: params.stateDir,
      taskId: params.task.id,
      profile: params.profile,
      phase: 'done',
      payload: { elapsedMs: result.elapsedMs },
    })
    await archiveWorkerResult(
      params.stateDir,
      {
        ...base,
        ...(result.threadId !== undefined ? { threadId: result.threadId } : {}),
      },
      prompt,
      {
        ...result,
        ok: true,
      },
    )
    return {
      output: result.output,
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    await archiveWorkerResult(params.stateDir, base, prompt, {
      output: '',
      ok: false,
      error: err.message,
      errorName: err.name,
    })
    throw error
  }
}
