import { appendLog } from '../log/append.js'

import type { RuntimeState } from './runtime-adapter.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  QueryLookupMessage,
  ReadFileLookupMessage,
  TaskArchiveLookupMessage,
  TaskPlanStatus,
  TaskStatus,
  TokenUsage,
} from '../types/index.js'

export type ManagerRoundExtra = {
  historyLookup?: HistoryLookupMessage[]
  queryLookup?: QueryLookupMessage
  readFileLookup?: ReadFileLookupMessage[]
  taskArchiveLookup?: TaskArchiveLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
}

export const buildLookupKey = (params: {
  queryKey?: string
  queryContextKey?: string
  readFileKey?: string
  taskArchiveKey?: string
}): string | undefined => {
  const { queryKey, queryContextKey, readFileKey, taskArchiveKey } = params
  if (!queryKey && !queryContextKey && !readFileKey && !taskArchiveKey)
    return undefined
  return `${queryKey ?? ''}\n---\n${queryContextKey ?? ''}\n---\n${readFileKey ?? ''}\n---\n${taskArchiveKey ?? ''}`
}

export const hasNoFollowupRequests = (params: {
  hasQueryRequest: boolean
  hasQueryContextRequest: boolean
  hasReadFileRequest: boolean
  hasTaskArchiveRequest: boolean
  feedbackCount: number
}): boolean => {
  const {
    hasQueryRequest,
    hasQueryContextRequest,
    hasReadFileRequest,
    hasTaskArchiveRequest,
    feedbackCount,
  } = params
  return (
    !hasQueryRequest &&
    !hasQueryContextRequest &&
    !hasReadFileRequest &&
    !hasTaskArchiveRequest &&
    feedbackCount === 0
  )
}

export const buildActionFeedbackContext = (params: {
  runtime: RuntimeState
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
}): {
  taskStatusById: Map<string, TaskStatus>
  planStatusById: Map<string, TaskPlanStatus>
  resultTaskIds: Set<string>
  allowAskUserChoice: boolean
} => {
  const { runtime, allowAskUserChoice, resultTaskIds } = params
  return {
    taskStatusById: new Map(
      runtime.tasks.map((task) => [task.id, task.status]),
    ),
    planStatusById: new Map(
      runtime.taskPlans.map((plan) => [plan.id, plan.status]),
    ),
    resultTaskIds,
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

export const buildBatchSuccessResult = <
  TParsed extends {
    text: string
    actions: unknown[]
  },
>(params: {
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
