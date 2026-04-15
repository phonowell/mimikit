import { compareIsoDesc } from '../../foundation/shared/time.js'
import { resolveSystemEvent } from '../../surface/shared/system-event.js'
import { resolveDefaultFocusId } from '../../work/focus/state.js'

import {
  sortInputsNewestFirst,
  sortResultsNewestFirst,
} from './workline-recency.js'

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

const dedupeFocusIds = (focusIds: Array<FocusId | undefined>): FocusId[] => {
  const ordered: FocusId[] = []
  const seen = new Set<FocusId>()
  for (const focusId of focusIds) {
    const normalized = focusId?.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    ordered.push(normalized)
  }
  return ordered
}

const resolveRecentUserFocusIds = (
  runtime: ManagerRuntime,
  inputsNewestFirst: UserInput[],
): FocusId[] =>
  dedupeFocusIds(
    inputsNewestFirst
      .filter((input) => input.role === 'user')
      .map((input) => resolveKnownFocusId(runtime, input.focusId)),
  )

const resolveRecentResultFocusIds = (
  runtime: ManagerRuntime,
  resultsNewestFirst: TaskResult[],
): FocusId[] => {
  const taskById = new Map(runtime.domain.tasks.map((task) => [task.id, task]))
  return dedupeFocusIds(
    resultsNewestFirst.map((result) =>
      resolveKnownFocusId(runtime, taskById.get(result.taskId)?.focusId),
    ),
  )
}

const resolveRecentTriggerFocusIds = (
  runtime: ManagerRuntime,
  inputsNewestFirst: UserInput[],
): FocusId[] => {
  const planById = new Map(
    runtime.domain.taskPlans.map((plan) => [plan.id, plan]),
  )
  return dedupeFocusIds(
    inputsNewestFirst.flatMap((input) => {
      if (input.role !== 'system') return []
      const event = resolveSystemEvent(input)
      if (event.name !== 'trigger_fire') return []
      const planId =
        typeof event.payload?.plan_id === 'string'
          ? event.payload.plan_id.trim()
          : ''
      if (planId) {
        const plan = planById.get(planId)
        const planFocusId = resolveKnownFocusId(runtime, plan?.focusId)
        if (planFocusId) return [planFocusId]
      }
      return [resolveKnownFocusId(runtime, input.focusId)]
    }),
  )
}

const resolveProgressablePlanStageFocusIds = (
  runtime: ManagerRuntime,
): FocusId[] =>
  dedupeFocusIds(
    runtime.domain.taskPlans
      .filter((plan) => plan.status === 'active' && plan.runtime.stage)
      .filter((plan) => plan.runtime.stage?.needsDecision !== true)
      .sort((a, b) => {
        const diff = compareIsoDesc(
          a.runtime.stage?.updatedAt,
          b.runtime.stage?.updatedAt,
        )
        if (diff !== 0) return diff
        return a.id.localeCompare(b.id)
      })
      .map((plan) => resolveKnownFocusId(runtime, plan.focusId)),
  )

const resolveLatestOpenTaskFocusIds = (runtime: ManagerRuntime): FocusId[] => {
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
  return dedupeFocusIds(
    openTasks.map((task) => resolveKnownFocusId(runtime, task.focusId)),
  )
}

const resolveRecentActiveFocusIds = (runtime: ManagerRuntime): FocusId[] =>
  runtime.domain.focuses
    .filter((focus) => focus.status === 'active')
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
    .map((focus) => focus.id)

export const resolveBatchWorkingFocusIds = (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
}): FocusId[] => {
  const inputsNewestFirst = sortInputsNewestFirst(params.inputs)
  const resultsNewestFirst = sortResultsNewestFirst(params.results)
  return dedupeFocusIds([
    ...resolveRecentUserFocusIds(params.runtime, inputsNewestFirst),
    ...resolveRecentResultFocusIds(params.runtime, resultsNewestFirst),
    ...resolveRecentTriggerFocusIds(params.runtime, inputsNewestFirst),
    ...resolveProgressablePlanStageFocusIds(params.runtime),
    ...resolveLatestOpenTaskFocusIds(params.runtime),
    ...resolveRecentActiveFocusIds(params.runtime),
    resolveDefaultFocusId(params.runtime),
  ])
}
