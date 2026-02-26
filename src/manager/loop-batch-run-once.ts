import { runManager } from './runner.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  Task,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

export const runManagerBatchOnce = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  intents: RuntimeState['idleIntents']
  workingFocusIds: string[]
  extra?: {
    historyLookup?: HistoryLookupMessage[]
    actionFeedback?: ManagerActionFeedback[]
  }
  onTextDelta: (delta: string) => void
  onUsage: (usage: TokenUsage) => void
}): Promise<{ output: string; elapsedMs: number; usage?: TokenUsage }> => {
  let callUsage: TokenUsage | undefined
  const result = await runManager({
    stateDir: params.runtime.config.workDir,
    workDir: params.runtime.config.workDir,
    inputs: params.inputs,
    results: params.results,
    tasks: params.tasks,
    intents: params.intents,
    cronJobs: params.runtime.cronJobs,
    focuses: params.runtime.focuses,
    focusContexts: params.runtime.focusContexts,
    activeFocusIds: params.runtime.activeFocusIds,
    workingFocusIds: params.workingFocusIds,
    ...(params.extra?.historyLookup
      ? { historyLookup: params.extra.historyLookup }
      : {}),
    ...(params.extra?.actionFeedback
      ? { actionFeedback: params.extra.actionFeedback }
      : {}),
    ...(params.runtime.managerCompressedContext
      ? { compressedContext: params.runtime.managerCompressedContext }
      : {}),
    ...(params.runtime.lastUserMeta
      ? { env: { lastUser: params.runtime.lastUserMeta } }
      : {}),
    model: params.runtime.config.manager.model,
    maxPromptTokens: params.runtime.config.manager.prompt.maxTokens,
    onTextDelta: params.onTextDelta,
    onUsage: (usage) => {
      callUsage = usage
      params.onUsage(usage)
    },
  })
  const resolvedUsage = result.usage ?? callUsage
  return {
    ...result,
    ...(resolvedUsage ? { usage: resolvedUsage } : {}),
  }
}
