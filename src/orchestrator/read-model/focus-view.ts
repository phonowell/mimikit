import { normalizeFocusOpenItems } from '../../focus/open-items.js'
import { compareIsoDesc } from '../../shared/time.js'

import type { FocusContext, FocusMeta, Task } from '../../types/index.js'

export type FocusView = {
  id: string
  title: string
  status: FocusMeta['status']
  isActive: boolean
  lastTaskId?: string
  updatedAt: string
  lastActivityAt: string
  summary?: string
  openItems?: string[]
}

const sortByLastActivityDesc = (a: FocusMeta, b: FocusMeta): number => {
  const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

const normalizeSummary = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const normalizeId = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const sortTasksByCreatedAtDesc = (
  a: Pick<Task, 'id' | 'createdAt'>,
  b: Pick<Task, 'id' | 'createdAt'>,
): number => {
  const diff = compareIsoDesc(a.createdAt, b.createdAt)
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

const buildLatestTaskIdByFocus = (
  tasks: readonly Pick<Task, 'id' | 'focusId' | 'createdAt'>[],
): ReadonlyMap<string, string> => {
  if (tasks.length === 0) return new Map()
  const latestTaskByFocus = new Map<string, string>()
  const sortedTasks = [...tasks].sort(sortTasksByCreatedAtDesc)
  for (const task of sortedTasks) {
    const focusId = normalizeId(task.focusId)
    if (!focusId || latestTaskByFocus.has(focusId)) continue
    const taskId = normalizeId(task.id)
    if (!taskId) continue
    latestTaskByFocus.set(focusId, taskId)
  }
  return latestTaskByFocus
}

export const buildFocusViews = (
  focuses: FocusMeta[],
  focusContexts: FocusContext[],
  activeFocusIds: string[],
  limit = 200,
  tasks: readonly Pick<Task, 'id' | 'focusId' | 'createdAt'>[] = [],
): { items: FocusView[] } => {
  const activeSet = new Set(activeFocusIds)
  const latestTaskIdByFocus = buildLatestTaskIdByFocus(tasks)
  const contextById = new Map(
    focusContexts.map((context) => [context.focusId, context] as const),
  )
  const items = focuses
    .filter((focus) => focus.status !== 'archived')
    .sort(sortByLastActivityDesc)
    .slice(0, Math.max(0, limit))
    .map((focus) => {
      const context = contextById.get(focus.id)
      const lastTaskId = latestTaskIdByFocus.get(focus.id)
      const summary = normalizeSummary(context?.summary)
      const titleFallback = normalizeSummary(focus.title)
      const title = titleFallback ?? summary ?? focus.id
      const resolvedSummary = summary ?? titleFallback
      const openItems = normalizeFocusOpenItems(context?.openItems)
      return {
        id: focus.id,
        title,
        status: focus.status,
        isActive: activeSet.has(focus.id),
        ...(lastTaskId ? { lastTaskId } : {}),
        updatedAt: focus.updatedAt,
        lastActivityAt: focus.lastActivityAt,
        ...(resolvedSummary ? { summary: resolvedSummary } : {}),
        ...(openItems ? { openItems } : {}),
      }
    })
  return { items }
}
