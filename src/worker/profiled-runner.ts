import { buildWorkerPrompt } from '../prompts/build-prompts.js'
import { loadPromptSource } from '../prompts/prompt-loader.js'
import { runWithProvider } from '../providers/registry.js'
import { getRuntimeReaperBridge } from '../runtime/reaper-bridge.js'
import { appendTaskProgress } from '../storage/task-progress.js'

import { runWorkerLoop } from './profiled-runner-loop.js'

import type { ManagerFocusCompressedContext } from '../orchestrator/core/runtime-state.js'
import type {
  FocusContext,
  FocusMeta,
  Task,
  TokenUsage,
  WorkerProvider,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type LlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

type BuildRunModelParams = {
  provider: WorkerProvider
  runtimeId: string
  workDir: string
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
      provider: params.provider === 'opencode' ? 'opencode-sdk' : 'codex-sdk',
      role: 'worker',
      prompt: input.prompt,
      runtimeId: params.runtimeId,
      workDir: params.workDir,
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
      ...(params.provider === 'opencode'
        ? {
            onRuntimeChildStarted: (child) =>
              getRuntimeReaperBridge(params.runtimeId)?.onRuntimeChildStarted(
                child,
              ) ?? Promise.resolve(),
            onRuntimeChildStopped: (id) =>
              getRuntimeReaperBridge(params.runtimeId)?.onRuntimeChildStopped(
                id,
              ) ?? Promise.resolve(),
          }
        : {}),
    })

type WorkerRunnerParams = {
  provider: WorkerProvider
  runtimeId: string
  stateDir: string
  workDir: string
  task: Task
  sessionId?: string
  focusMeta?: FocusMeta
  focusContext?: FocusContext
  compressedFocusContext?: ManagerFocusCompressedContext
  timeoutMs: number
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
  const prompt = await buildWorkerPrompt({
    workDir: params.workDir,
    task: params.task,
    ...(params.focusMeta ? { focusMeta: params.focusMeta } : {}),
    ...(params.focusContext ? { focusContext: params.focusContext } : {}),
    ...(params.compressedFocusContext
      ? { compressedFocusContext: params.compressedFocusContext }
      : {}),
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
  })
}
