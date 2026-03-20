import { appendLog } from '../log/append.js'

import { resolveManagerActionSurface } from './action-surface.js'
import { collectConfirmedRunTaskChoiceIds } from './run-task-confirmation.js'
import { listEnabledWorkerProviders } from './worker-provider-selection.js'

import type { SupplementalEvidenceSource } from './action-intent-evidence.js'
import type { RuntimeState } from './runtime-adapter.js'
import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  ManagerWakeProfile,
  QueryLookupMessage,
  ReadFileLookupMessage,
  TaskPlanStatus,
  TaskStatus,
  TokenUsage,
  UserInput,
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
  wakeProfile: ManagerWakeProfile
  inputs?: UserInput[]
  roundExtra?: ManagerRoundExtra
}): {
  taskStatusById: Map<string, TaskStatus>
  taskById: Map<string, RuntimeState['tasks'][number]>
  planStatusById: Map<string, TaskPlanStatus>
  resultTaskIds: Set<string>
  allowAskUserChoice: boolean
  enabledWorkerProviders: Set<WorkerProvider>
  confirmedRunTaskChoiceIds: Set<string>
  wakeProfile: ManagerWakeProfile
  allowedActions: Set<string>
  inputs: UserInput[]
  supplementalEvidenceSources: Set<SupplementalEvidenceSource>
} => {
  const {
    runtime,
    allowAskUserChoice,
    resultTaskIds,
    wakeProfile,
    inputs,
    roundExtra,
  } = params
  const enabledWorkerProviders = new Set<WorkerProvider>(
    listEnabledWorkerProviders(runtime.config).map((item) => item.provider),
  )
  const currentInputs = inputs ?? runtime.session.inflightInputs
  const confirmedRunTaskChoiceIds =
    collectConfirmedRunTaskChoiceIds(currentInputs)
  const actionSurface = resolveManagerActionSurface(wakeProfile)
  const supplementalEvidenceSources = new Set<SupplementalEvidenceSource>()
  if (resultTaskIds.size > 0) supplementalEvidenceSources.add('task_result')
  if (roundExtra?.queryLookup) supplementalEvidenceSources.add('query_lookup')
  if (roundExtra?.readFileLookup && roundExtra.readFileLookup.length > 0)
    supplementalEvidenceSources.add('read_file')
  if (roundExtra?.historyLookup && roundExtra.historyLookup.length > 0)
    supplementalEvidenceSources.add('history_lookup')
  return {
    taskStatusById: new Map(
      runtime.tasks.map((task) => [task.id, task.status]),
    ),
    taskById: new Map(runtime.tasks.map((task) => [task.id, task])),
    planStatusById: new Map(
      runtime.taskPlans.map((plan) => [plan.id, plan.status]),
    ),
    resultTaskIds,
    allowAskUserChoice,
    enabledWorkerProviders,
    confirmedRunTaskChoiceIds,
    wakeProfile,
    allowedActions: actionSurface.actionNames,
    inputs: currentInputs,
    supplementalEvidenceSources,
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
