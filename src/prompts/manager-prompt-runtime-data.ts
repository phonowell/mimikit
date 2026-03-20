import { buildFocusPromptPayload } from '../focus/index.js'
import { buildPaths } from '../fs/paths.js'
import { readHistory } from '../history/store.js'
import { type MemoryScoreContext } from '../memory/entry-score.js'
import { buildMemoryPromptSections } from '../memory/prompt-sections.js'
import { readMemoryEntries } from '../memory/store.js'
import { readTaskResultsForTasks } from '../storage/task-results.js'

import {
  buildTaskResultDateHints,
  collectResultTaskIds,
  collectTaskResults,
  mergeTaskResults,
} from './build-prompts-helpers.js'
import { stringifyPromptJson } from './format-base.js'
import { buildQuoteReferenceLookup } from './format.js'

import type { BuildManagerPromptParams } from './manager-prompt-types.js'
import type { FocusId, Task, TaskPlan, UserInput } from '../types/index.js'

const MAX_MEMORY_QUERY_CHARS = 4_000
const MAX_MEMORY_MENTION_ITEMS = 128
const MAX_RECENT_HISTORY_SUMMARY_ITEMS = 8

const pushMention = (target: string[], value: string | undefined): void => {
  const normalized = value?.trim()
  if (!normalized) return
  target.push(normalized)
}

const buildMemoryPromptScoreContext = (params: {
  inputs: UserInput[]
  tasks: Task[]
  plans: TaskPlan[]
  focusPayload: ReturnType<typeof buildFocusPromptPayload>
  workingFocusIds: FocusId[]
}): MemoryScoreContext => {
  const mentionTexts: string[] = []
  for (const input of params.inputs) pushMention(mentionTexts, input.text)
  for (const task of params.tasks) {
    pushMention(mentionTexts, task.title)
    pushMention(mentionTexts, task.result?.output)
  }
  for (const plan of params.plans) pushMention(mentionTexts, plan.title)
  for (const focus of params.focusPayload.focusList)
    pushMention(mentionTexts, focus.title)
  for (const focus of params.focusPayload.workingFocuses) {
    pushMention(mentionTexts, focus.summary)
    for (const openItem of focus.openItems ?? [])
      pushMention(mentionTexts, openItem)
  }

  const uniqueForQuery: string[] = []
  const querySeen = new Set<string>()
  for (const item of mentionTexts) {
    const key = item.trim().toLowerCase()
    if (!key || querySeen.has(key)) continue
    querySeen.add(key)
    uniqueForQuery.push(item)
  }

  return {
    queryText: uniqueForQuery
      .slice(0, MAX_MEMORY_MENTION_ITEMS)
      .join('\n')
      .slice(0, MAX_MEMORY_QUERY_CHARS),
    mentionTexts: mentionTexts.slice(0, MAX_MEMORY_MENTION_ITEMS),
    workingFocusIds: params.workingFocusIds,
  }
}

const summarizeRecentHistory = (
  recentHistory: ReturnType<typeof buildFocusPromptPayload>['recentHistory'],
): string => {
  if (recentHistory.length === 0) return ''
  const sorted = [...recentHistory]
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt)
        return left.createdAt.localeCompare(right.createdAt)
      return left.id.localeCompare(right.id)
    })
    .slice(Math.max(0, recentHistory.length - MAX_RECENT_HISTORY_SUMMARY_ITEMS))
  const byRole = new Map<string, number>()
  for (const item of sorted) {
    const { role } = item
    byRole.set(role, (byRole.get(role) ?? 0) + 1)
  }
  const roleSummary = Array.from(byRole.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([role, count]) => `${role}:${count}`)
    .join(',')
  const latest = sorted[sorted.length - 1]
  return stringifyPromptJson({
    summary: {
      recent_count: recentHistory.length,
      sampled_count: sorted.length,
      role_counts: roleSummary,
      latest_time: latest?.createdAt ?? '',
      latest_id: latest?.id ?? '',
    },
    pointers: sorted.map((item) => ({
      id: item.id,
      role: item.role,
      time: item.createdAt,
      focus_id: item.focusId,
    })),
  })
}

export type ManagerPromptRuntimeData = {
  pendingResults: BuildManagerPromptParams['results']
  resultsForTasks: BuildManagerPromptParams['results']
  focusPayload: ReturnType<typeof buildFocusPromptPayload>
  quoteLookup: ReturnType<typeof buildQuoteReferenceLookup>
  memoryPrompts: ReturnType<typeof buildMemoryPromptSections>
  recentHistorySource: string
}

export type ManagerPromptRuntimeDemand = {
  includeTasks: boolean
  includeInputs: boolean
  includeRememberedMemory: boolean
  includeMemory: boolean
  includeWorkingFocuses: boolean
  includeRecentHistory: boolean
}

const DEFAULT_RUNTIME_DEMAND: ManagerPromptRuntimeDemand = {
  includeTasks: true,
  includeInputs: true,
  includeRememberedMemory: true,
  includeMemory: true,
  includeWorkingFocuses: true,
  includeRecentHistory: true,
}

const normalizeRuntimeDemand = (
  demand?: Partial<ManagerPromptRuntimeDemand>,
): ManagerPromptRuntimeDemand => ({
  includeTasks: demand?.includeTasks ?? DEFAULT_RUNTIME_DEMAND.includeTasks,
  includeInputs: demand?.includeInputs ?? DEFAULT_RUNTIME_DEMAND.includeInputs,
  includeRememberedMemory:
    demand?.includeRememberedMemory ??
    DEFAULT_RUNTIME_DEMAND.includeRememberedMemory,
  includeMemory: demand?.includeMemory ?? DEFAULT_RUNTIME_DEMAND.includeMemory,
  includeWorkingFocuses:
    demand?.includeWorkingFocuses ??
    DEFAULT_RUNTIME_DEMAND.includeWorkingFocuses,
  includeRecentHistory:
    demand?.includeRecentHistory ?? DEFAULT_RUNTIME_DEMAND.includeRecentHistory,
})

const hasQuotedInputs = (inputs: UserInput[]): boolean =>
  inputs.some((item) => item.quote?.trim().length)

export const prepareManagerPromptRuntimeData = async (
  params: BuildManagerPromptParams,
  demandInput?: Partial<ManagerPromptRuntimeDemand>,
): Promise<ManagerPromptRuntimeData> => {
  const demand = normalizeRuntimeDemand(demandInput)
  const workingFocusIds = params.workingFocusIds ?? []
  const pendingResults = mergeTaskResults(params.results, [])
  const knownResults = mergeTaskResults(
    pendingResults,
    collectTaskResults(params.tasks),
  )
  const statePaths = buildPaths(params.stateDir)

  const requiresFocusHistory =
    (demand.includeWorkingFocuses && workingFocusIds.length > 0) ||
    demand.includeRecentHistory
  const requiresQuoteHistory = demand.includeInputs && hasQuotedInputs(params.inputs)
  const shouldReadHistory = requiresFocusHistory || requiresQuoteHistory
  const history = shouldReadHistory
    ? await readHistory(statePaths.history)
    : []

  const shouldLoadMemory = demand.includeRememberedMemory || demand.includeMemory
  const memoryEntries = shouldLoadMemory
    ? await readMemoryEntries(statePaths.memoryFile)
    : []

  const resultTaskIds = demand.includeTasks ? collectResultTaskIds(params.tasks) : []
  const dateHints = buildTaskResultDateHints(params.tasks)
  const archivedResults =
    resultTaskIds.length > 0
      ? await readTaskResultsForTasks(params.stateDir, resultTaskIds, {
          dateHints,
        })
      : []
  const pendingResultIds = new Set(pendingResults.map((result) => result.taskId))
  const mergedResults = mergeTaskResults(knownResults, archivedResults)
  const resultsForTasks = demand.includeTasks
    ? mergedResults.filter((result) => !pendingResultIds.has(result.taskId))
    : []

  const focusHistory = requiresFocusHistory ? history : []
  const focusPayload = buildFocusPromptPayload({
    focuses: params.focuses ?? [],
    history: focusHistory,
    workingFocusIds,
  })
  const quoteLookup =
    demand.includeInputs && hasQuotedInputs(params.inputs)
      ? buildQuoteReferenceLookup({
          history,
          inputs: params.inputs,
        })
      : new Map()
  const memoryPrompts = shouldLoadMemory
    ? buildMemoryPromptSections({
        entries: memoryEntries,
        context: buildMemoryPromptScoreContext({
          inputs: params.inputs,
          tasks: params.tasks,
          plans: params.plans ?? [],
          focusPayload,
          workingFocusIds,
        }),
        maxBytes: params.promptSectionLimits.memoryMaxBytes,
        includeRemembered: demand.includeRememberedMemory,
        includeMemory: demand.includeMemory,
      })
    : { rememberedMemory: '', memory: '' }
  return {
    pendingResults,
    resultsForTasks,
    focusPayload,
    quoteLookup,
    memoryPrompts,
    recentHistorySource: demand.includeRecentHistory
      ? summarizeRecentHistory(focusPayload.recentHistory)
      : '',
  }
}
