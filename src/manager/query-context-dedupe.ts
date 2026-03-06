import { parseIsoToMs } from '../shared/time.js'

import { tokenizeSearchText } from './query-context-score.js'

import type {
  QueryLookupFocusItem,
  QueryLookupHistoryItem,
  QueryLookupPlanItem,
  QueryLookupTaskArchiveItem,
  QueryLookupTaskItem,
} from '../types/index.js'

export type QueryScopeItems = {
  history: QueryLookupHistoryItem[]
  tasks: QueryLookupTaskItem[]
  focus: QueryLookupFocusItem[]
  plans: QueryLookupPlanItem[]
  task_archives: QueryLookupTaskArchiveItem[]
}

type ScopeName = keyof QueryScopeItems

type FlatEntry = {
  key: string
  score: number
  timeMs: number
  normalizedText: string
  tokenSet: Set<string>
}

const normalizeText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ')

const computeTokenOverlap = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0
  const smaller = left.size <= right.size ? left : right
  const larger = left.size <= right.size ? right : left
  let hitCount = 0
  for (const token of smaller) if (larger.has(token)) hitCount += 1
  return hitCount / Math.min(left.size, right.size)
}

const isDuplicateEntry = (left: FlatEntry, right: FlatEntry): boolean => {
  if (!left.normalizedText || !right.normalizedText) return false
  if (left.normalizedText === right.normalizedText) return true
  const minChars = Math.min(
    left.normalizedText.length,
    right.normalizedText.length,
  )
  if (minChars < 24) return false
  return computeTokenOverlap(left.tokenSet, right.tokenSet) >= 0.92
}

const pushFlatEntry = (params: {
  flat: FlatEntry[]
  scope: ScopeName
  ref: string
  score: number
  timeMs: number
  text: string
}): void => {
  const normalizedText = normalizeText(params.text)
  if (!normalizedText) return
  params.flat.push({
    key: `${params.scope}\n${params.ref}`,
    score: params.score,
    timeMs: params.timeMs,
    normalizedText,
    tokenSet: new Set(tokenizeSearchText(normalizedText)),
  })
}

const collectFlatEntries = (itemsByScope: QueryScopeItems): FlatEntry[] => {
  const flat: FlatEntry[] = []
  for (const item of itemsByScope.history) {
    pushFlatEntry({
      flat,
      scope: 'history',
      ref: item.ref,
      score: item.score,
      timeMs: parseIsoToMs(item.time),
      text: item.snippet,
    })
  }
  for (const item of itemsByScope.tasks) {
    pushFlatEntry({
      flat,
      scope: 'tasks',
      ref: item.ref,
      score: item.score,
      timeMs: parseIsoToMs(item.createdAt),
      text: item.snippet,
    })
  }
  for (const item of itemsByScope.focus) {
    pushFlatEntry({
      flat,
      scope: 'focus',
      ref: item.ref,
      score: item.score,
      timeMs: parseIsoToMs(item.updatedAt),
      text: item.summary ?? item.title,
    })
  }
  for (const item of itemsByScope.plans) {
    pushFlatEntry({
      flat,
      scope: 'plans',
      ref: item.ref,
      score: item.score,
      timeMs: parseIsoToMs(item.updatedAt),
      text: item.snippet,
    })
  }
  for (const item of itemsByScope.task_archives) {
    pushFlatEntry({
      flat,
      scope: 'task_archives',
      ref: item.ref,
      score: item.score,
      timeMs: parseIsoToMs(item.completedAt),
      text: item.snippet ?? item.title ?? '',
    })
  }
  return flat
}

export const dedupeQueryScopeItems = (
  itemsByScope: QueryScopeItems,
): QueryScopeItems => {
  const ranked = collectFlatEntries(itemsByScope).sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score
    if (left.timeMs !== right.timeMs) return right.timeMs - left.timeMs
    return left.key.localeCompare(right.key)
  })

  const winners: FlatEntry[] = []
  for (const candidate of ranked) {
    let duplicated = false
    for (const kept of winners) {
      if (!isDuplicateEntry(candidate, kept)) continue
      duplicated = true
      break
    }
    if (!duplicated) winners.push(candidate)
  }

  const winnerKeys = new Set(winners.map((item) => item.key))
  return {
    history: itemsByScope.history.filter((item) =>
      winnerKeys.has(`history\n${item.ref}`),
    ),
    tasks: itemsByScope.tasks.filter((item) =>
      winnerKeys.has(`tasks\n${item.ref}`),
    ),
    focus: itemsByScope.focus.filter((item) =>
      winnerKeys.has(`focus\n${item.ref}`),
    ),
    plans: itemsByScope.plans.filter((item) =>
      winnerKeys.has(`plans\n${item.ref}`),
    ),
    task_archives: itemsByScope.task_archives.filter((item) =>
      winnerKeys.has(`task_archives\n${item.ref}`),
    ),
  }
}
