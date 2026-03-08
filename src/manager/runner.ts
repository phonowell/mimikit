import { buildManagerPromptPayload } from '../prompts/build-prompts.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveResult,
} from '../storage/traces-archive.js'

import { runManagerLlmCall } from './manager-llm-call.js'
import { hashPromptPrefix } from './prompt-stability.js'

import type { AppConfig } from '../config.js'
import type {
  FocusContext,
  FocusId,
  FocusMeta,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  QueryLookupMessage,
  ReadFileLookupMessage,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'
import type { ModelReasoningEffort } from '@openai/codex-sdk'

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error))

export const runManager = async (params: {
  stateDir: string
  workDir: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  promptSectionLimits: AppConfig['manager']['promptSections']
  plans?: TaskPlan[]
  historyLookup?: HistoryLookupMessage[]
  queryLookup?: QueryLookupMessage
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  focusContexts?: FocusContext[]
  activeFocusIds?: FocusId[]
  workingFocusIds?: FocusId[]
  model?: string
  baseUrl?: string | undefined
  apiKey?: string | undefined
  proxy?: string | undefined
  threadId?: string | null
  modelReasoningEffort?: ModelReasoningEffort | undefined
  onUsage?: (usage: TokenUsage) => void
  usePromptSegments?: boolean
}): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
  promptPrefixHash: string
  threadId?: string | null
}> => {
  const promptPayload = await buildManagerPromptPayload({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    promptSectionLimits: params.promptSectionLimits,
    ...(params.plans ? { plans: params.plans } : {}),
    ...(params.historyLookup ? { historyLookup: params.historyLookup } : {}),
    ...(params.queryLookup ? { queryLookup: params.queryLookup } : {}),
    ...(params.readFileLookup ? { readFileLookup: params.readFileLookup } : {}),
    ...(params.actionFeedback ? { actionFeedback: params.actionFeedback } : {}),
    ...(params.env ? { env: params.env } : {}),
    ...(params.focuses ? { focuses: params.focuses } : {}),
    ...(params.focusContexts ? { focusContexts: params.focusContexts } : {}),
    ...(params.activeFocusIds ? { activeFocusIds: params.activeFocusIds } : {}),
    ...(params.workingFocusIds
      ? { workingFocusIds: params.workingFocusIds }
      : {}),
  })
  const { prompt, promptSegments, prefix } = promptPayload
  const promptPrefixHash = hashPromptPrefix(prefix)

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
      ...(params.onUsage ? { onUsage: params.onUsage } : {}),
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
