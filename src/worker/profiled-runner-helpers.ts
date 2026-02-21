import { runWithProvider } from '../providers/registry.js'
import { appendTaskProgress } from '../storage/task-progress.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveEntry,
  type TraceArchiveResult,
} from '../storage/traces-archive.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

type ProgressPhase = 'start' | 'done'

export type LlmResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
}

export type ProviderResult = {
  output: string
  elapsedMs: number
  usage?: TokenUsage
  threadId?: string | null
}

export type RunModelInput = {
  prompt: string
  threadId?: string | null
  onUsage?: (usage: TokenUsage) => void
}

type BuildRunModelParams = {
  workDir: string
  timeoutMs: number
  model?: string
  modelReasoningEffort?: ModelReasoningEffort
  abortSignal?: AbortSignal
}

const progressType = (phase: ProgressPhase): string => `worker_${phase}`

export const archiveWorkerResult = (
  stateDir: string,
  base: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: TraceArchiveResult,
) => appendTraceArchiveResult(stateDir, base, prompt, result)

export const buildRunModel =
  (params: BuildRunModelParams) =>
  (input: RunModelInput): Promise<ProviderResult> =>
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

export const appendWorkerProgress = (params: {
  stateDir: string
  taskId: string
  phase: ProgressPhase
  payload: Record<string, unknown>
}) =>
  appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: progressType(params.phase),
    payload: params.payload,
  })
