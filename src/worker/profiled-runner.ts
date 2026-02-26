import { runWithProvider } from '../providers/registry.js'
import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { loadPromptSource } from '../prompts/prompt-loader.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import { runWorkerLoop } from './profiled-runner-loop.js'

import type { Task, TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

type BuildRunModelParams = {
  workDir: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}

const buildRunModel =
  (params: BuildRunModelParams) =>
  (input: { prompt: string; threadId?: string | null; onUsage?: (usage: TokenUsage) => void }) =>
    runWithProvider({
      provider: 'codex-sdk',
      role: 'worker',
      prompt: input.prompt,
      workDir: params.workDir,
      timeoutMs: params.timeoutMs,
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      ...(input.onUsage ? { onUsage: input.onUsage } : {}),
    })

type WorkerRunnerParams = {
  stateDir: string
  workDir: string
  task: Task
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
}

export const runWorker = async (
  params: WorkerRunnerParams,
): Promise<LlmResult> => {
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
  })
  const continueSource = await loadPromptSource('worker/continue-until-done.md')

  await appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.task.id,
    type: 'worker_start',
  })

  return runWorkerLoop({
    stateDir: params.stateDir,
    task: params.task,
    prompt,
    continueTemplate: continueSource.template,
    continueTemplatePath: continueSource.path,
    archiveBase: {
      role: 'worker' as const,
      taskId: params.task.id,
      ...(params.model ? { model: params.model } : {}),
    },
    runModel: buildRunModel(params),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
  })
}
