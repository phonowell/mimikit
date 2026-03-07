import { parseIsoToMs } from '../shared/time.js'

import { tokenizeSearchText } from './query-context-score.js'

import type {
  QueryLookupFocusItem,
  QueryLookupGeneratedIndexItem,
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
  generated_index: QueryLookupGeneratedIndexItem[]
  task_archives: QueryLookupTaskArchiveItem[]
}

type ScopeName = keyof QueryScopeItems
type ScopedLookupItem = { ref: string; score: number }
type FlatEntry = {
  key: string
  score: number
  timeMs: number
  normalizedText: string
  tokenSet: Set<string>
}

const normalizeText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ')

const toEntryKey = (scope: ScopeName, ref: string): string => `${scope}\n${ref}`

const computeTokenOverlap = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) return 0
  const [smaller, larger] =
    left.size <= right.size ? [left, right] : [right, left]
  let hitCount = 0
  for (const token of smaller) if (larger.has(token)) hitCount += 1
  return hitCount / Math.min(left.size, right.size)
}

const isDuplicateEntry = (left: FlatEntry, right: FlatEntry): boolean => {
  if (!left.normalizedText || !right.normalizedText) return false
  if (left.normalizedText === right.normalizedText) return true
  if (Math.min(left.normalizedText.length, right.normalizedText.length) < 24)
    return false
  return computeTokenOverlap(left.tokenSet, right.tokenSet) >= 0.92
}

const appendFlatEntries = <TItem extends ScopedLookupItem>(params: {
  target: FlatEntry[]
  scope: ScopeName
  items: readonly TItem[]
  resolve: (item: TItem) => { time: string; text: string }
}): void => {
  for (const item of params.items) {
    const { time, text } = params.resolve(item)
    const normalizedText = normalizeText(text)
    if (!normalizedText) continue
    params.target.push({
      key: toEntryKey(params.scope, item.ref),
      score: item.score,
      timeMs: parseIsoToMs(time),
      normalizedText,
      tokenSet: new Set(tokenizeSearchText(normalizedText)),
    })
  }
}

const collectFlatEntries = (itemsByScope: QueryScopeItems): FlatEntry[] => {
  const flat: FlatEntry[] = []
  appendFlatEntries({
    target: flat,
    scope: 'history',
    items: itemsByScope.history,
    resolve: (item) => ({ time: item.time, text: item.snippet }),
  })
  appendFlatEntries({
    target: flat,
    scope: 'tasks',
    items: itemsByScope.tasks,
    resolve: (item) => ({ time: item.createdAt, text: item.snippet }),
  })
  appendFlatEntries({
    target: flat,
    scope: 'focus',
    items: itemsByScope.focus,
    resolve: (item) => ({
      time: item.updatedAt,
      text: item.summary ?? item.title,
    }),
  })
  appendFlatEntries({
    target: flat,
    scope: 'plans',
    items: itemsByScope.plans,
    resolve: (item) => ({ time: item.updatedAt, text: item.snippet }),
  })
  appendFlatEntries({
    target: flat,
    scope: 'generated_index',
    items: itemsByScope.generated_index,
    resolve: (item) => ({
      time: item.updatedAt,
      text: [item.path, item.snippet ?? ''].join('\n'),
    }),
  })
  appendFlatEntries({
    target: flat,
    scope: 'task_archives',
    items: itemsByScope.task_archives,
    resolve: (item) => ({
      time: item.completedAt,
      text: item.snippet ?? item.title ?? '',
    }),
  })
  return flat
}

const filterScopeItems = <TItem extends { ref: string }>(
  scope: ScopeName,
  items: readonly TItem[],
  winnerKeys: Set<string>,
): TItem[] =>
  items.filter((item) => winnerKeys.has(toEntryKey(scope, item.ref)))

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
    if (winners.some((kept) => isDuplicateEntry(candidate, kept))) continue
    winners.push(candidate)
  }

  const winnerKeys = new Set(winners.map((item) => item.key))
  return {
    history: filterScopeItems('history', itemsByScope.history, winnerKeys),
    tasks: filterScopeItems('tasks', itemsByScope.tasks, winnerKeys),
    focus: filterScopeItems('focus', itemsByScope.focus, winnerKeys),
    plans: filterScopeItems('plans', itemsByScope.plans, winnerKeys),
    generated_index: filterScopeItems(
      'generated_index',
      itemsByScope.generated_index,
      winnerKeys,
    ),
    task_archives: filterScopeItems(
      'task_archives',
      itemsByScope.task_archives,
      winnerKeys,
    ),
  }
}
