import { compareIsoDesc } from '../../foundation/shared/time.js'
import { normalizeFocusOpenItems } from '../../work/focus/open-items.js'

import type { FocusMeta, Task } from '../../foundation/types/index.js'

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

const FOCUS_STATUS_RANK: Record<FocusMeta['status'], number> = {
  active: 0,
  idle: 1,
  done: 2,
  archived: 3,
}

const compareFocusViews = (a: FocusView, b: FocusView): number => {
  if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
  const statusDiff = FOCUS_STATUS_RANK[a.status] - FOCUS_STATUS_RANK[b.status]
  if (statusDiff !== 0) return statusDiff
  const activityDiff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
  if (activityDiff !== 0) return activityDiff
  const updatedDiff = compareIsoDesc(a.updatedAt, b.updatedAt)
  if (updatedDiff !== 0) return updatedDiff
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
  limit = 200,
  tasks: readonly Pick<Task, 'id' | 'focusId' | 'createdAt'>[] = [],
): { items: FocusView[] } => {
  const latestTaskIdByFocus = buildLatestTaskIdByFocus(tasks)
  const items = focuses
    .filter((focus) => focus.status !== 'archived')
    .map((focus) => {
      const lastTaskId = latestTaskIdByFocus.get(focus.id)
      const summary = normalizeSummary(focus.summary)
      const titleFallback = normalizeSummary(focus.title)
      const title = titleFallback ?? focus.id
      const openItems = normalizeFocusOpenItems(focus.openItems)
      return {
        id: focus.id,
        title,
        status: focus.status,
        isActive: focus.status === 'active',
        ...(lastTaskId ? { lastTaskId } : {}),
        updatedAt: focus.updatedAt,
        lastActivityAt: focus.lastActivityAt,
        ...(summary ? { summary } : {}),
        ...(openItems ? { openItems } : {}),
      }
    })
    .sort(compareFocusViews)
    .slice(0, Math.max(0, limit))
  return { items }
}
