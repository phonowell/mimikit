import { sortTasksByChangedAt } from '../../prompts/format-base.js'
import { compareIsoDesc, parseIsoToMsOrZero } from '../../shared/time.js'

import type { PlanPriority, Task, TaskPlan } from '../../types/index.js'

export type WindowSelectParams = {
  minCount: number
  maxCount: number
}

const normalizeWindowParams = (
  params: WindowSelectParams,
): WindowSelectParams => {
  const minCount = Math.max(0, params.minCount)
  const maxCount = Math.max(minCount, params.maxCount)
  return { minCount, maxCount }
}

export const selectByWindow = <T>(
  items: T[],
  params: WindowSelectParams,
): T[] => {
  const normalized = normalizeWindowParams(params)
  if (items.length === 0 || normalized.maxCount === 0) return []
  const selected: T[] = []
  for (const item of items) {
    selected.push(item)
    if (selected.length >= normalized.maxCount) break
  }
  return selected
}

const PRIORITY_RANK: Record<PlanPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
}

const comparePriorityFifo = (a: TaskPlan, b: TaskPlan): number => {
  const priorityRank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (priorityRank !== 0) return priorityRank
  const createdDiff =
    parseIsoToMsOrZero(a.createdAt) - parseIsoToMsOrZero(b.createdAt)
  if (createdDiff !== 0) return createdDiff
  return a.id.localeCompare(b.id)
}

const compareDoneDesc = (a: TaskPlan, b: TaskPlan): number => {
  const aChanged = parseIsoToMsOrZero(a.closedAt ?? a.updatedAt)
  const bChanged = parseIsoToMsOrZero(b.closedAt ?? b.updatedAt)
  if (aChanged !== bChanged) return bChanged - aChanged
  return a.id.localeCompare(b.id)
}

const statusRank = (status: TaskPlan['status']): number => {
  if (status === 'active') return 0
  if (status === 'blocked') return 1
  return 2
}

export const sortTaskPlans = (plans: TaskPlan[]): TaskPlan[] =>
  [...plans].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status)
    if (rankDiff !== 0) return rankDiff
    if (a.status === 'done') return compareDoneDesc(a, b)
    return comparePriorityFifo(a, b)
  })

const comparePlanChangedAtDesc = (a: TaskPlan, b: TaskPlan): number =>
  compareIsoDesc(a.closedAt ?? a.updatedAt, b.closedAt ?? b.updatedAt)

export const sortTaskPlansForView = (plans: TaskPlan[]): TaskPlan[] =>
  [...plans].sort((a, b) => {
    const rankDiff = statusRank(a.status) - statusRank(b.status)
    if (rankDiff !== 0) return rankDiff
    const changedDiff = comparePlanChangedAtDesc(a, b)
    if (changedDiff !== 0) return changedDiff
    const priorityDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return a.id.localeCompare(b.id)
  })

export const selectRecentPlans = (
  plans: TaskPlan[],
  params: WindowSelectParams,
): TaskPlan[] => {
  if (plans.length === 0) return []
  const sorted = sortTaskPlans(plans)
  return selectByWindow(sorted, params)
}

export const selectRecentTasks = (
  tasks: Task[],
  params: WindowSelectParams,
): Task[] => {
  if (tasks.length === 0) return []
  const sorted = sortTasksByChangedAt(tasks)
  return selectByWindow(sorted, params)
}
