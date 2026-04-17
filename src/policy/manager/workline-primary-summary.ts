import { compareIsoDesc } from '../../foundation/shared/time.js'
import { resolveSystemEvent } from '../../surface/shared/system-event.js'

import { resolveQuotedPrimaryWorkline } from './workline-quoted-scope.js'
import {
  sortInputsNewestFirst,
  sortResultsNewestFirst,
} from './workline-recency.js'

import type {
  FocusId,
  Task,
  TaskPlan,
  TaskResult,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerContextPacket } from '../types/manager-types.js'

const resolveLatestInputForFocus = (
  focusId: FocusId,
  inputs: UserInput[],
): UserInput | undefined =>
  sortInputsNewestFirst(inputs).find(
    (input) => input.role === 'user' && input.focusId.trim() === focusId,
  )

const resolveLatestResultForFocus = (
  focusId: FocusId,
  tasks: Task[],
  results: TaskResult[],
): TaskResult | undefined => {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  return sortResultsNewestFirst(results).find(
    (result) => taskById.get(result.taskId)?.focusId.trim() === focusId,
  )
}

const resolveLatestTriggerPlanForFocus = (
  focusId: FocusId,
  plans: TaskPlan[],
  inputs: UserInput[],
): TaskPlan | undefined => {
  const planById = new Map(plans.map((plan) => [plan.id, plan]))
  for (const input of sortInputsNewestFirst(inputs)) {
    if (input.role !== 'system') continue
    const event = resolveSystemEvent(input)
    if (event.name !== 'trigger_fire') continue
    const planId =
      typeof event.payload?.plan_id === 'string'
        ? event.payload.plan_id.trim()
        : ''
    const plan = planId ? planById.get(planId) : undefined
    if (plan?.focusId.trim() === focusId) return plan
  }
  return undefined
}

const resolvePrimaryPlanStage = (
  focusId: FocusId,
  plans: TaskPlan[],
): TaskPlan | undefined =>
  [...plans]
    .filter(
      (plan) =>
        plan.status === 'active' &&
        plan.focusId.trim() === focusId &&
        plan.runtime.stage !== undefined,
    )
    .sort((a, b) => {
      if (
        Boolean(a.runtime.stage?.needsDecision) !==
        Boolean(b.runtime.stage?.needsDecision)
      )
        return a.runtime.stage?.needsDecision ? 1 : -1
      const diff = compareIsoDesc(
        a.runtime.stage?.updatedAt,
        b.runtime.stage?.updatedAt,
      )
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })[0]

const resolveLatestOpenTaskForFocus = (
  focusId: FocusId,
  tasks: Task[],
): Task | undefined =>
  [...tasks]
    .filter(
      (task) =>
        task.focusId.trim() === focusId &&
        (task.status === 'pending' ||
          task.status === 'running' ||
          task.status === 'paused'),
    )
    .sort((a, b) => {
      const diff = compareIsoDesc(a.createdAt, b.createdAt)
      if (diff !== 0) return diff
      return b.id.localeCompare(a.id)
    })[0]

export const resolvePrimaryWorkline = (params: {
  workingFocusIds: FocusId[]
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
}): ManagerContextPacket['primaryWorkline'] | undefined => {
  const focusId = params.workingFocusIds[0]?.trim()
  if (!focusId) return undefined
  const latestInput = resolveLatestInputForFocus(focusId, params.inputs)
  if (latestInput) {
    const quotedScope = resolveQuotedPrimaryWorkline({
      input: latestInput,
      tasks: params.tasks,
      plans: params.plans,
    })
    if (quotedScope) return quotedScope
    return {
      focusId,
      source: 'user_input',
      sourceInputId: latestInput.id,
    }
  }
  const latestResult = resolveLatestResultForFocus(
    focusId,
    params.tasks,
    params.results,
  )
  if (latestResult) {
    return {
      focusId,
      source: 'task_result',
      sourceTaskId: latestResult.taskId,
      ...(latestResult.handoff?.summary
        ? { summary: latestResult.handoff.summary }
        : {}),
    }
  }
  const triggerPlan = resolveLatestTriggerPlanForFocus(
    focusId,
    params.plans,
    params.inputs,
  )
  if (triggerPlan) {
    return {
      focusId,
      source: 'trigger',
      sourcePlanId: triggerPlan.id,
    }
  }
  const planStage = resolvePrimaryPlanStage(focusId, params.plans)
  if (planStage?.runtime.stage) {
    return {
      focusId,
      source: 'plan_stage',
      sourcePlanId: planStage.id,
      sourceTaskId: planStage.runtime.stage.sourceTaskId,
      summary: planStage.runtime.stage.summary,
      needsDecision: planStage.runtime.stage.needsDecision,
    }
  }
  const openTask = resolveLatestOpenTaskForFocus(focusId, params.tasks)
  if (openTask) {
    return {
      focusId,
      source: 'open_task',
      sourceTaskId: openTask.id,
    }
  }
  return {
    focusId,
    source: 'recent_activity',
  }
}
