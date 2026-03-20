import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { loadPromptSource } from '../prompts/prompt-loader.js'
import { runWithProvider } from '../providers/registry.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import { runWorkerLoop } from './profiled-runner-loop.js'

import type { TaskFocusBrief } from '../prompts/format-task-focus-brief.js'
import type { Task, TokenUsage, WorkerProvider } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

type BuildRunModelParams = {
  provider: WorkerProvider
  runtimeId: string
  cwd: string
  timeoutMs: number
  proxy?: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}

const buildRunModel =
  (params: BuildRunModelParams) =>
  (input: {
    prompt: string
    threadId?: string | null
    onUsage?: (usage: TokenUsage) => void
    onPartialOutput?: (output: string) => void
  }) =>
    runWithProvider({
      provider: 'codex-sdk',
      role: 'worker',
      prompt: input.prompt,
      runtimeId: params.runtimeId,
      workDir: params.cwd,
      timeoutMs: params.timeoutMs,
      ...(params.proxy ? { proxy: params.proxy } : {}),
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.model ? { model: params.model } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      ...(input.onUsage ? { onUsage: input.onUsage } : {}),
      ...(input.onPartialOutput
        ? { onPartialOutput: input.onPartialOutput }
        : {}),
    })

type WorkerRunnerParams = {
  provider: WorkerProvider
  runtimeId: string
  stateDir: string
  cwd: string
  task: Task
  sessionId?: string
  focusBrief?: TaskFocusBrief
  timeoutMs: number
  budget?: {
    maxDurationMs: number
    maxRounds: number
  }
  proxy?: string
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
  onSessionId?: (sessionId: string) => Promise<void> | void
  onUsage?: (usage: TokenUsage) => void
  onPartialOutput?: (output: string) => void
}

export const runWorker = async (
  params: WorkerRunnerParams,
): Promise<LlmResult> => {
  if (params.provider !== 'codex') {
    throw new Error(`[worker] unsupported provider: ${params.provider}`)
  }
  const prompt = await buildWorkerPrompt({
    stateDir: params.stateDir,
    workspaceDir: params.cwd,
    task: params.task,
    ...(params.focusBrief ? { focusBrief: params.focusBrief } : {}),
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
    ...(params.sessionId ? { initialThreadId: params.sessionId } : {}),
    continueTemplate: continueSource.template,
    continueTemplatePath: continueSource.path,
    archiveBase: {
      role: 'worker' as const,
      taskId: params.task.id,
      ...(params.model ? { model: params.model } : {}),
    },
    runModel: buildRunModel(params),
    ...(params.onSessionId ? { onSessionId: params.onSessionId } : {}),
    ...(params.onUsage ? { onUsage: params.onUsage } : {}),
    ...(params.onPartialOutput
      ? { onPartialOutput: params.onPartialOutput }
      : {}),
    ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
    ...(params.budget ? { budget: params.budget } : {}),
  })
}
