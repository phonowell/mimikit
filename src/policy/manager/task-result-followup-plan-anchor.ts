import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'

import type {
  Task,
  TaskPlan,
  TaskResult,
} from '../../foundation/types/index.js'

export const hasStructuredPlanFollowupAnchor = (params: {
  plan: TaskPlan
  task: Task
  result: TaskResult
}): boolean => {
  const lastTaskId = params.plan.runtime.lastTaskId?.trim()
  if (!lastTaskId || lastTaskId !== params.result.taskId) return false
  if (params.plan.effect.taskTemplate.cwd.trim() !== params.task.cwd.trim())
    return false
  return (
    resolveTaskResourceMode(params.plan.effect.taskTemplate.resourceMode) ===
    resolveTaskResourceMode(params.task.resourceMode)
  )
}

export const resolveStructuredAnchoredPlan = (params: {
  activePlans: TaskPlan[]
  task: Task
  result: TaskResult
}): TaskPlan | undefined => {
  const anchoredPlans = params.activePlans.filter((plan) =>
    hasStructuredPlanFollowupAnchor({
      plan,
      task: params.task,
      result: params.result,
    }),
  )
  if (anchoredPlans.length !== 1) return undefined
  return anchoredPlans[0]
}
