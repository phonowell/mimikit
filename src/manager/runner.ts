import { buildManagerPrompt } from '../prompts/build-prompts.js'
import {
  appendTraceArchiveResult,
  type TraceArchiveResult,
} from '../storage/traces-archive.js'

import { runManagerLlmCall } from './manager-llm-call.js'

import type { AppConfig } from '../config.js'
import type {
  FocusContext,
  FocusId,
  FocusMeta,
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerEnv,
  ReadFileLookupMessage,
  Task,
  TaskResult,
  TaskPlan,
  TokenUsage,
  UserInput,
} from '../types/index.js'

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
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
  env?: ManagerEnv
  focuses?: FocusMeta[]
  focusContexts?: FocusContext[]
  activeFocusIds?: FocusId[]
  workingFocusIds?: FocusId[]
  model?: string
  onTextDelta?: (delta: string) => void
  onUsage?: (usage: TokenUsage) => void
}): Promise<{
  output: string
  elapsedMs: number
  usage?: TokenUsage
}> => {
  const prompt = await buildManagerPrompt({
    stateDir: params.stateDir,
    workDir: params.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    promptSectionLimits: params.promptSectionLimits,
    ...(params.plans ? { plans: params.plans } : {}),
    ...(params.historyLookup ? { historyLookup: params.historyLookup } : {}),
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
      workDir: params.workDir,
      ...(model ? { model } : {}),
      ...(params.onTextDelta ? { onTextDelta: params.onTextDelta } : {}),
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
