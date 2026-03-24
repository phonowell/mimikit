import { createHash } from 'node:crypto'

import { buildPaths } from '../../persistence/fs/paths.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveResult,
} from '../../persistence/storage/traces-archive.js'
import { buildManagerPromptPayload } from '../prompts/build-prompts.js'

import { runManagerLlmCall } from './manager-llm-call.js'

import type { AppConfig } from '../../bootstrap/config.js'
import type {
  FocusId,
  FocusMeta,
  ManagerActionFeedback,
  ManagerContextPacket,
  ManagerEnv,
  ManagerPacketMode,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

const hashPromptPrefix = (prefix: string): string =>
  createHash('sha256').update(prefix, 'utf8').digest('hex')

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: AppConfig['manager']['promptSections']
  plans?: TaskPlan[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  workingFocusIds?: FocusId[]
  model?: string
  baseUrl?: string | undefined
  apiKey?: string | undefined
  proxy?: string | undefined
  threadId?: string | null
  modelReasoningEffort?: ModelReasoningEffort | undefined
  retry?: {
    maxAttempts: number
    backoffMs: number
  }
  abortSignal?: AbortSignal
  onUsage?: (usage: TokenUsage) => void
  usePromptSegments?: boolean
  packetMode?: ManagerPacketMode
  wakeProfile?: ManagerEnv['wakeProfile']
}): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
  promptPrefixHash: string
  threadId?: string | null
  contextPacket: ManagerContextPacket
  packetSummary: string
  promptBytes: number
  promptSegmentCount: number
}> => {
  const promptPayload = await buildManagerPromptPayload({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    promptSectionLimits: params.promptSectionLimits,
    ...(params.plans ? { plans: params.plans } : {}),
    ...(params.actionFeedback ? { actionFeedback: params.actionFeedback } : {}),
    ...(params.env ? { env: params.env } : {}),
    ...(params.focuses ? { focuses: params.focuses } : {}),
    ...(params.workingFocusIds
      ? { workingFocusIds: params.workingFocusIds }
      : {}),
    ...(params.packetMode ? { packetMode: params.packetMode } : {}),
    ...(params.wakeProfile ? { wakeProfile: params.wakeProfile } : {}),
  })
  const { prompt, promptSegments, prefix, contextPacket, packetSummary } =
    promptPayload
  const promptPrefixHash = hashPromptPrefix(prefix)
  const paths = buildPaths(params.stateDir)

  const model = params.model?.trim()
  const archive = (
    threadId: string | null | undefined,
    data: TraceArchiveResult,
    promptText: string,
  ) =>
    appendTraceArchiveResult(
      params.stateDir,
      {
        role: 'manager',
        ...(model ? { model } : {}),
        ...(threadId ? { threadId } : {}),
        attempt: 'primary',
      },
      promptText,
      data,
    )

  try {
    const result = await runManagerLlmCall({
      prompt,
      ...(params.usePromptSegments === false ? {} : { promptSegments }),
      workDir: params.workDir,
      ...(model ? { model } : {}),
      ...(params.baseUrl ? { baseUrl: params.baseUrl } : {}),
      ...(params.apiKey ? { apiKey: params.apiKey } : {}),
      ...(params.proxy ? { proxy: params.proxy } : {}),
      ...(params.threadId ? { threadId: params.threadId } : {}),
      ...(params.modelReasoningEffort
        ? { modelReasoningEffort: params.modelReasoningEffort }
        : {}),
      ...(params.retry ? { retry: params.retry } : {}),
      ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
      logPath: paths.log,
      logContext: {
        event: 'llm_call',
        role: 'manager',
        promptPrefixHash,
        promptSegmentCount:
          params.usePromptSegments === false ? 1 : promptSegments.length,
        promptSegmentCacheControl:
          params.usePromptSegments === false
            ? []
            : promptSegments.map((segment) => segment.cacheControl ?? 'none'),
      },
    })
    await archive(
      result.threadId ?? undefined,
      { ...result, ok: true },
      result.prompt,
    )
    return {
      output: result.output,
      elapsedMs: result.elapsedMs,
      ...(result.usage ? { usage: result.usage } : {}),
      promptPrefixHash,
      ...(result.threadId ? { threadId: result.threadId } : {}),
      contextPacket,
      packetSummary,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      promptSegmentCount:
        params.usePromptSegments === false ? 1 : promptSegments.length,
    }
  } catch (error) {
    const err = toError(error)
    await archive(
      undefined,
      {
        output: '',
        ok: false,
        error: err.message,
        errorName: err.name,
      },
      prompt,
    )
    throw error
  }
}
