import { isSupportedByInputs } from './action-intent-evidence-match.js'
import { matchesWriteEnqueueLane } from './action-intent-evidence-write-lane.js'
import { buildSetPlanUpdateSemanticText } from './authorization-plan-semantics.js'
import { hasSemanticAlignment } from './authorization-semantics.js'

import type { Task, TaskPlan } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const resolveSingleActivePlanContinuationTarget = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  planById?: Map<string, TaskPlan>
  defaultFocusId?: string
}): TaskPlan | undefined => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || !params.planById) return undefined
  const candidates = [...params.planById.values()].filter(
    (plan) =>
      plan.status === 'active' &&
      plan.focusId.trim() === focusId &&
      matchesWriteEnqueueLane({
        item: params.item,
        cwd: plan.effect.taskTemplate.cwd,
        resourceMode: plan.effect.taskTemplate.resourceMode,
        useWorktree: plan.effect.taskTemplate.useWorktree,
      }),
  )
  return candidates.length === 1 ? candidates[0] : undefined
}

const resolveSingleResultTaskContinuationTarget = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  taskById?: Map<string, Task>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): Task | undefined => {
  const focusId = params.defaultFocusId?.trim()
  if (!focusId || !params.taskById || !params.resultTaskIds?.size)
    return undefined
  const candidates = [...params.resultTaskIds]
    .map((taskId) => params.taskById?.get(taskId))
    .filter((task): task is Task => {
      if (!task) return false
      return (
        task.focusId.trim() === focusId &&
        matchesWriteEnqueueLane({
          item: params.item,
          cwd: task.cwd,
          resourceMode: task.resourceMode,
          useWorktree: Boolean(task.git),
        })
      )
    })
  return candidates.length === 1 ? candidates[0] : undefined
}

const inputDirectlyReferencesPlan = (
  inputTexts: string[],
  plan: TaskPlan | undefined,
): boolean => {
  if (!plan) return false
  return isSupportedByInputs({
    candidates: [plan.id, plan.title],
    inputs: inputTexts,
  })
}

const inputDirectlyReferencesTask = (
  inputTexts: string[],
  task: Task | undefined,
): boolean => {
  if (!task) return false
  return isSupportedByInputs({
    candidates: [task.id, task.title],
    inputs: inputTexts,
  })
}

export const supportsDirectWriteEnqueueContinuationTarget = (params: {
  item: Extract<Parsed, { type: 'enqueue_task' }>
  inputTexts: string[]
  taskById?: Map<string, Task>
  planById?: Map<string, TaskPlan>
  resultTaskIds?: Set<string>
  defaultFocusId?: string
}): boolean => {
  const plan = resolveSingleActivePlanContinuationTarget(params)
  if (inputDirectlyReferencesPlan(params.inputTexts, plan)) return true
  const task = resolveSingleResultTaskContinuationTarget(params)
  return inputDirectlyReferencesTask(params.inputTexts, task)
}

export const supportsDirectWritePlanUpdateTarget = (params: {
  item: Extract<Parsed, { type: 'set_plan' }>
  inputTexts: string[]
  planById?: Map<string, TaskPlan>
}): boolean => {
  if (params.item.plan_id === null) return false
  const currentPlan = params.planById?.get(params.item.plan_id)
  if (
    !inputDirectlyReferencesPlan(params.inputTexts, currentPlan) ||
    !currentPlan
  )
    return false
  if (
    hasSemanticAlignment(currentPlan.title, params.item.plan.title) ||
    hasSemanticAlignment(
      currentPlan.effect.taskTemplate.title,
      params.item.plan.task.title,
    ) ||
    hasSemanticAlignment(
      currentPlan.effect.taskContract?.goal ?? '',
      params.item.plan.task.goal,
    )
  )
    return true
  return hasSemanticAlignment(
    buildSetPlanUpdateSemanticText(params.item, currentPlan),
    params.inputTexts.join('\n'),
  )
}
