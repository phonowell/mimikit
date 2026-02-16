import { runWithProvider } from '../providers/registry.js'
import { appendTaskProgress } from '../storage/task-progress.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveEntry,
  type TraceArchiveResult,
} from '../storage/traces-archive.js'

import type { TokenUsage } from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

export type WorkerProvider = 'codex-sdk' | 'opencode'
export type WorkerProfile = 'standard' | 'specialist'
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

type BuildRunModelCommonParams = {
  workDir: string
  timeoutMs: number
  model?: string
  abortSignal?: AbortSignal
}

type BuildOpencodeModelParams = BuildRunModelCommonParams & {
  provider: 'opencode'
}

type BuildCodexModelParams = BuildRunModelCommonParams & {
  provider: 'codex-sdk'
  modelReasoningEffort?: ModelReasoningEffort
}

type BuildRunModelParams = BuildOpencodeModelParams | BuildCodexModelParams

const progressType = (profile: WorkerProfile, phase: ProgressPhase): string =>
  `${profile}_${phase}`

export const archiveWorkerResult = (
  stateDir: string,
  base: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: TraceArchiveResult,
) => appendTraceArchiveResult(stateDir, base, prompt, result)

export const buildRunModel =
  (params: BuildRunModelParams) =>
  (input: RunModelInput): Promise<ProviderResult> =>
    params.provider === 'codex-sdk'
      ? runWithProvider({
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
      : runWithProvider({
          provider: 'opencode',
          role: 'worker',
          prompt: input.prompt,
          workDir: params.workDir,
          timeoutMs: params.timeoutMs,
          ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
          ...(params.model ? { model: params.model } : {}),
          ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
          ...(input.onUsage ? { onUsage: input.onUsage } : {}),
        })

export const appendProfileProgress = (params: {
  stateDir: string
  taskId: string
  profile: WorkerProfile
  phase: ProgressPhase
  payload: Record<string, unknown>
}) =>
  appendTaskProgress({
    stateDir: params.stateDir,
    taskId: params.taskId,
    type: progressType(params.profile, params.phase),
    payload: params.payload,
  })
