import { sortTasksByChangedAt } from '../../foundation/prompting/format-base.js'
import {
  compareIsoDesc,
  parseIsoToMsOrZero,
} from '../../foundation/shared/time.js'

import {
  selectByWorklinePriority,
  type WindowSelectParams,
} from './workline-window.js'

import type {
  PlanPriority,
  Task,
  TaskPlan,
} from '../../foundation/types/index.js'

export type { WindowSelectParams } from './workline-window.js'

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
  const aChanged = parseIsoToMsOrZero(a.runtime.closedAt ?? a.updatedAt)
  const bChanged = parseIsoToMsOrZero(b.runtime.closedAt ?? b.updatedAt)
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
  compareIsoDesc(
    a.runtime.closedAt ?? a.updatedAt,
    b.runtime.closedAt ?? b.updatedAt,
  )

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
  return selectByWorklinePriority(sorted, params, {
    isPrimary: (plan, normalized) =>
      normalized.workingFocusIds.has(plan.focusId) &&
      (plan.status === 'active' || plan.status === 'blocked'),
    isAnchor: (plan, normalized) =>
      Boolean(
        normalized.latestResultTaskId &&
        (plan.runtime.lastTaskId === normalized.latestResultTaskId ||
          plan.runtime.stage?.sourceTaskId === normalized.latestResultTaskId),
      ),
    isRelated: (plan, normalized) =>
      normalized.workingFocusIds.has(plan.focusId),
  })
}

export const selectRecentTasks = (
  tasks: Task[],
  params: WindowSelectParams,
): Task[] => {
  if (tasks.length === 0) return []
  const sorted = sortTasksByChangedAt(tasks)
  return selectByWorklinePriority(sorted, params, {
    isPrimary: (task, normalized) =>
      normalized.workingFocusIds.has(task.focusId) &&
      (task.status === 'pending' || task.status === 'running'),
    isAnchor: (task, normalized) => task.id === normalized.latestResultTaskId,
    isRelated: (task, normalized) =>
      normalized.workingFocusIds.has(task.focusId),
  })
}
