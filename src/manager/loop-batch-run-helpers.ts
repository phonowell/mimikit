import { appendLog } from '../log/append.js'

import { listEnabledWorkerProviders } from './worker-provider-selection.js'

import type { RuntimeState } from './runtime-adapter.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  QueryLookupMessage,
  ReadFileLookupMessage,
  TaskPlanStatus,
  TaskStatus,
  TokenUsage,
  WorkerProvider,
} from '../types/index.js'

export type ManagerRoundExtra = {
  historyLookup?: HistoryLookupMessage[]
  queryLookup?: QueryLookupMessage
  readFileLookup?: ReadFileLookupMessage[]
  actionFeedback?: ManagerActionFeedback[]
}

const buildReadFileLookupEntryKey = (item: ReadFileLookupMessage): string =>
  [
    item.path.trim(),
    item.status,
    item.encoding,
    String(item.fromLine ?? ''),
    String(item.lineCount ?? ''),
    String(item.totalLines ?? ''),
    String(item.truncated ?? ''),
    item.error?.trim() ?? '',
  ].join('\n')

export const mergeReadFileLookupHistory = (params: {
  previous?: ReadFileLookupMessage[] | undefined
  current?: ReadFileLookupMessage[] | undefined
}): ReadFileLookupMessage[] | undefined => {
  const previous = params.previous ?? []
  const current = params.current ?? []
  if (previous.length === 0 && current.length === 0) return undefined
  if (previous.length === 0) return [...current]
  if (current.length === 0) return [...previous]

  const merged: ReadFileLookupMessage[] = []
  const seen = new Set<string>()
  for (const item of [...previous, ...current]) {
    const key = buildReadFileLookupEntryKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

export const buildLookupKey = (params: {
  queryContextKey?: string
  readFileKey?: string
}): string | undefined => {
  const { queryContextKey, readFileKey } = params
  if (!queryContextKey && !readFileKey) return undefined
  return `${queryContextKey ?? ''}\n---\n${readFileKey ?? ''}`
}

export const hasNoFollowupRequests = (params: {
  hasQueryContextRequest: boolean
  hasReadFileRequest: boolean
  feedbackCount: number
}): boolean => {
  const { hasQueryContextRequest, hasReadFileRequest, feedbackCount } = params
  return !hasQueryContextRequest && !hasReadFileRequest && feedbackCount === 0
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
  enabledWorkerProviders: Set<WorkerProvider>
} => {
  const { runtime, allowAskUserChoice, resultTaskIds } = params
  const enabledWorkerProviders = new Set<WorkerProvider>(
    listEnabledWorkerProviders(runtime.config).map((item) => item.provider),
  )
  return {
    taskStatusById: new Map(
      runtime.tasks.map((task) => [task.id, task.status]),
    ),
    planStatusById: new Map(
      runtime.taskPlans.map((plan) => [plan.id, plan.status]),
    ),
    resultTaskIds,
    allowAskUserChoice,
    enabledWorkerProviders,
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
