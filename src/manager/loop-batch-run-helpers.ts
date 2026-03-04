import { appendLog } from '../log/append.js'

import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  ReadFileLookupMessage,
  TaskPlanStatus,
  TaskStatus,
} from '../types/index.js'
import type { RuntimeState } from './runtime-adapter.js'
import type { TokenUsage } from '../types/index.js'

export type ManagerRoundExtra = {
  historyLookup?: HistoryLookupMessage[]
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
}

export const buildLookupKey = (params: {
  queryKey?: string
  readFileKey?: string
}): string | undefined => {
  const { queryKey, readFileKey } = params
  if (!queryKey && !readFileKey) return undefined
  return `${queryKey ?? ''}\n---\n${readFileKey ?? ''}`
}

export const hasNoFollowupRequests = (params: {
  hasQueryRequest: boolean
  hasReadFileRequest: boolean
  feedbackCount: number
}): boolean => {
  const { hasQueryRequest, hasReadFileRequest, feedbackCount } = params
  return !hasQueryRequest && !hasReadFileRequest && feedbackCount === 0
}

export const buildActionFeedbackContext = (params: {
  runtime: RuntimeState
  hasQueryData: boolean
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
}): {
  taskStatusById: Map<string, TaskStatus>
  planStatusById: Map<string, TaskPlanStatus>
  resultTaskIds: Set<string>
  hasCompressibleContext: boolean
  allowAskUserChoice: boolean
} => {
  const { runtime, hasQueryData, allowAskUserChoice, resultTaskIds } = params
  return {
    taskStatusById: new Map(runtime.tasks.map((task) => [task.id, task.status])),
    planStatusById: new Map(
      runtime.taskPlans.map((plan) => [plan.id, plan.status]),
    ),
    resultTaskIds,
    hasCompressibleContext:
      runtime.managerFocusCompressedContexts.length > 0 ||
      runtime.tasks.length > 0 ||
      runtime.taskPlans.length > 0 ||
      hasQueryData ||
      runtime.queues.inputsCursor > 0 ||
      runtime.queues.resultsCursor > 0,
    allowAskUserChoice,
  }
}

export const logManagerBatchStart = (
  runtime: RuntimeState,
  inputIds: string[],
  resultIds: string[],
): Promise<void> =>
  appendLog(runtime.paths.log, {
    event: 'manager_start',
    inputCount: inputIds.length,
    resultCount: resultIds.length,
    inputIds,
    resultIds,
  })

export const buildRoundLimitResult = (params: {
  text: string
  elapsedMs: number
  usage?: TokenUsage
}): {
  parsed: { text: string; actions: [] }
  elapsedMs: number
  usage?: TokenUsage
  roundLimitReached: true
} => ({
  parsed: {
    text: params.text,
    actions: [],
  },
  elapsedMs: params.elapsedMs,
  ...(params.usage ? { usage: params.usage } : {}),
  roundLimitReached: true,
})

export const buildBatchSuccessResult = <TParsed extends {
  text: string
  actions: unknown[]
}>(params: {
  parsed: TParsed
  elapsedMs: number
  usage?: TokenUsage
}): {
  parsed: TParsed
  elapsedMs: number
  usage?: TokenUsage
} => ({
  parsed: params.parsed,
  elapsedMs: params.elapsedMs,
  ...(params.usage ? { usage: params.usage } : {}),
})
