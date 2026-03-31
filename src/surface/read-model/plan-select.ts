import { sortTasksByChangedAt } from '../../foundation/prompting/format-base.js'
import {
  compareIsoDesc,
  parseIsoToMsOrZero,
} from '../../foundation/shared/time.js'

import type {
  PlanPriority,
  Task,
  TaskPlan,
} from '../../foundation/types/index.js'

export type WindowSelectParams = {
  minCount: number
  maxCount: number
  workingFocusIds?: string[] | undefined
  latestResultTaskId?: string | undefined
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
  const maxCount = Math.max(params.minCount, params.maxCount)
  const selected: TaskPlan[] = []
  const seen = new Set<string>()
  const focusIds = new Set(
    (params.workingFocusIds ?? []).map((item) => item.trim()),
  )
  const add = (plan: TaskPlan): void => {
    if (seen.has(plan.id) || selected.length >= maxCount) return
    seen.add(plan.id)
    selected.push(plan)
  }

  for (const plan of sortTaskPlans(plans))
    if (plan.status === 'active' || plan.status === 'blocked') add(plan)

  if (params.latestResultTaskId) {
    for (const plan of sortTaskPlans(plans))
      if (plan.runtime.lastTaskId === params.latestResultTaskId) add(plan)
  }
  for (const plan of sortTaskPlansForView(plans)) {
    if (selected.length >= params.minCount) break
    if (focusIds.has(plan.focusId)) add(plan)
  }
  for (const plan of sortTaskPlansForView(plans)) {
    if (selected.length >= params.minCount) break
    add(plan)
  }
  return selected
}

export const selectRecentTasks = (
  tasks: Task[],
  params: WindowSelectParams,
): Task[] => {
  if (tasks.length === 0) return []
  const maxCount = Math.max(params.minCount, params.maxCount)
  const selected: Task[] = []
  const seen = new Set<string>()
  const focusIds = new Set(
    (params.workingFocusIds ?? []).map((item) => item.trim()),
  )
  const ordered = sortTasksByChangedAt(tasks)
  const add = (task: Task): void => {
    if (seen.has(task.id) || selected.length >= maxCount) return
    seen.add(task.id)
    selected.push(task)
  }

  for (const task of ordered) {
    if (
      task.status === 'pending' ||
      task.status === 'running' ||
      task.status === 'paused'
    )
      add(task)
  }
  if (params.latestResultTaskId) {
    const latestTask = ordered.find(
      (task) => task.id === params.latestResultTaskId,
    )
    if (latestTask) add(latestTask)
  }
  for (const task of ordered) {
    if (selected.length >= params.minCount) break
    if (focusIds.has(task.focusId)) add(task)
  }
  for (const task of ordered) {
    if (selected.length >= params.minCount) break
    add(task)
  }
  return selected
}
