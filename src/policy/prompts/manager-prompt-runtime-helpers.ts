import { stringifyPromptJson } from '../../foundation/prompting/format-base.js'
import { type MemoryScoreContext } from '../memory/entry-score.js'

import type { BuildManagerPromptParams } from './manager-prompt-types.js'
import type { buildQuoteReferenceLookup } from '../../foundation/prompting/format.js'
import type { FocusId, Task, UserInput } from '../../foundation/types/index.js'
import type { buildFocusPromptPayload } from '../../work/focus/index.js'

const MAX_MEMORY_QUERY_CHARS = 4_000
const MAX_MEMORY_MENTION_ITEMS = 128
const MAX_RECENT_HISTORY_SUMMARY_ITEMS = 8
const MAX_NORMALIZED_WORKING_FOCUS_IDS = 5

const pushMention = (target: string[], value: string | undefined): void => {
  const normalized = value?.trim()
  if (!normalized) return
  target.push(normalized)
}

export type ManagerPromptRuntimeDemand = {
  includeTasks: boolean
  includeInputs: boolean
  includeProjectProfile: boolean
  includeRememberedMemory: boolean
  includeMemory: boolean
  includeWorkingFocuses: boolean
  includeRecentHistory: boolean
}

const DEFAULT_RUNTIME_DEMAND: ManagerPromptRuntimeDemand = {
  includeTasks: true,
  includeInputs: true,
  includeProjectProfile: true,
  includeRememberedMemory: true,
  includeMemory: true,
  includeWorkingFocuses: true,
  includeRecentHistory: true,
}

export const normalizeRuntimeDemand = (
  demand?: Partial<ManagerPromptRuntimeDemand>,
): ManagerPromptRuntimeDemand => ({
  includeTasks: demand?.includeTasks ?? DEFAULT_RUNTIME_DEMAND.includeTasks,
  includeInputs: demand?.includeInputs ?? DEFAULT_RUNTIME_DEMAND.includeInputs,
  includeProjectProfile:
    demand?.includeProjectProfile ??
    DEFAULT_RUNTIME_DEMAND.includeProjectProfile,
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

export const hasQuotedInputs = (inputs: UserInput[]): boolean =>
  inputs.some((item) => item.quote?.trim().length)

export const normalizeWorkingFocusIds = (
  workingFocusIds: FocusId[],
): FocusId[] => {
  const ordered: FocusId[] = []
  const seen = new Set<FocusId>()
  for (const focusId of workingFocusIds) {
    const normalized = focusId?.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    ordered.push(normalized)
    if (ordered.length >= MAX_NORMALIZED_WORKING_FOCUS_IDS) break
  }
  return ordered
}

export const buildMemoryPromptScoreContext = (params: {
  inputs: UserInput[]
  tasks: Task[]
  focusPayload: ReturnType<typeof buildFocusPromptPayload>
  workingFocusIds: FocusId[]
}): MemoryScoreContext => {
  const normalizedWorkingFocusIds = normalizeWorkingFocusIds(
    params.workingFocusIds,
  )
  const mentionTexts: string[] = []
  for (const input of params.inputs) pushMention(mentionTexts, input.text)
  for (const task of params.tasks) pushMention(mentionTexts, task.title)
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
    workingFocusIds: normalizedWorkingFocusIds,
  }
}

export const summarizeRecentHistory = (
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
  historyHydratedTaskIds: string[]
  normalizedWorkingFocusIds: FocusId[]
  focusPayload: ReturnType<typeof buildFocusPromptPayload>
  quoteLookup: ReturnType<typeof buildQuoteReferenceLookup>
  projectProfilePrompt: string
  memoryPrompts: {
    rememberedMemory: string
    memory: string
  }
  recentHistorySource: string
}
