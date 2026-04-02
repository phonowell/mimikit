import {
  compareIsoDesc,
  parseIsoToMsOrZero,
} from '../../foundation/shared/time.js'
import { resolveSystemEvent } from '../../surface/shared/system-event.js'
import { resolveDefaultFocusId } from '../../work/focus/index.js'

import type {
  FocusId,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const resolveKnownFocusId = (
  runtime: ManagerRuntime,
  focusId?: FocusId,
): FocusId | undefined => {
  const normalized = focusId?.trim()
  if (!normalized) return undefined
  const matched = runtime.domain.focuses.find((item) => item.id === normalized)
  if (!matched || matched.status === 'archived') return undefined
  return matched.id
}

const resolveLatestUserFocusId = (
  runtime: ManagerRuntime,
  inputsNewestFirst: UserInput[],
): FocusId | undefined => {
  for (const input of inputsNewestFirst) {
    if (input.role !== 'user') continue
    const focusId = resolveKnownFocusId(runtime, input.focusId)
    if (focusId) return focusId
  }
  return undefined
}

const resolveLatestResultFocusId = (
  runtime: ManagerRuntime,
  resultsNewestFirst: TaskResult[],
): FocusId | undefined => {
  const taskById = new Map(runtime.domain.tasks.map((task) => [task.id, task]))
  for (const result of resultsNewestFirst) {
    const task = taskById.get(result.taskId)
    if (!task) continue
    const focusId = resolveKnownFocusId(runtime, task.focusId)
    if (focusId) return focusId
  }
  return undefined
}

const resolveLatestTriggerFocusId = (
  runtime: ManagerRuntime,
  inputsNewestFirst: UserInput[],
): FocusId | undefined => {
  const planById = new Map(
    runtime.domain.taskPlans.map((plan) => [plan.id, plan]),
  )
  for (const input of inputsNewestFirst) {
    if (input.role !== 'system') continue
    const event = resolveSystemEvent(input)
    if (event.name !== 'trigger_fire') continue
    const planId =
      typeof event.payload?.plan_id === 'string'
        ? event.payload.plan_id.trim()
        : ''
    if (planId) {
      const plan = planById.get(planId)
      const planFocusId = resolveKnownFocusId(runtime, plan?.focusId)
      if (planFocusId) return planFocusId
    }
    const fallbackFocusId = resolveKnownFocusId(runtime, input.focusId)
    if (fallbackFocusId) return fallbackFocusId
  }
  return undefined
}

const resolveLatestOpenTaskFocusId = (
  runtime: ManagerRuntime,
): FocusId | undefined => {
  const openTasks = runtime.domain.tasks
    .filter(
      (task) =>
        task.status === 'pending' ||
        task.status === 'running' ||
        task.status === 'paused',
    )
    .sort((a, b) => {
      const diff = compareIsoDesc(a.createdAt, b.createdAt)
      if (diff !== 0) return diff
      return b.id.localeCompare(a.id)
    })
  for (const task of openTasks) {
    const focusId = resolveKnownFocusId(runtime, task.focusId)
    if (focusId) return focusId
  }
  return undefined
}

const resolveRecentActiveFocusId = (
  runtime: ManagerRuntime,
): FocusId | undefined => {
  const activeFocus = runtime.domain.focuses
    .filter((focus) => focus.status === 'active')
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
    .at(0)
  if (!activeFocus) return undefined
  return activeFocus.id
}

const resolveBatchPrimaryFocusId = (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
}): FocusId => {
  const inputsNewestFirst = [...params.inputs].sort((a, b) => {
    const diff =
      parseIsoToMsOrZero(b.createdAt) - parseIsoToMsOrZero(a.createdAt)
    if (diff !== 0) return diff
    return b.id.localeCompare(a.id)
  })
  const resultsNewestFirst = [...params.results].sort((a, b) => {
    const diff =
      parseIsoToMsOrZero(b.completedAt) - parseIsoToMsOrZero(a.completedAt)
    if (diff !== 0) return diff
    return b.taskId.localeCompare(a.taskId)
  })
  const latestUserFocusId = resolveLatestUserFocusId(
    params.runtime,
    inputsNewestFirst,
  )
  const latestResultFocusId = resolveLatestResultFocusId(
    params.runtime,
    resultsNewestFirst,
  )
  const latestTriggerFocusId = resolveLatestTriggerFocusId(
    params.runtime,
    inputsNewestFirst,
  )
  const latestOpenTaskFocusId = resolveLatestOpenTaskFocusId(params.runtime)
  const recentActiveFocusId = resolveRecentActiveFocusId(params.runtime)
  return (
    latestUserFocusId ??
    latestResultFocusId ??
    latestTriggerFocusId ??
    latestOpenTaskFocusId ??
    recentActiveFocusId ??
    resolveDefaultFocusId(params.runtime)
  )
}

export const resolveBatchWorkingFocusIds = (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
}): FocusId[] => [resolveBatchPrimaryFocusId(params)]
