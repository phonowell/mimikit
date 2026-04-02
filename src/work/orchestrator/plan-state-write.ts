import type { TaskPlan } from '../../foundation/types/index.js'
import type {
  RuntimePlanCollection,
  RuntimePlanStateSlice,
} from '../../kernel/orchestrator/runtime-interfaces.js'

const findPlanIndex = (plans: RuntimePlanCollection, planId: string): number =>
  plans.findIndex((plan) => plan.id === planId)

export const findRuntimePlan = (
  runtime: RuntimePlanStateSlice,
  planId: string,
): TaskPlan | undefined =>
  runtime.domain.taskPlans.find((plan) => plan.id === planId)

export const appendRuntimePlan = (params: {
  runtime: RuntimePlanStateSlice
  plan: TaskPlan
}): TaskPlan => {
  params.runtime.domain.taskPlans = [
    ...params.runtime.domain.taskPlans,
    params.plan,
  ]
  return params.plan
}

export const updateRuntimePlan = (params: {
  runtime: RuntimePlanStateSlice
  planId: string
  update: (current: TaskPlan) => TaskPlan
}): TaskPlan | undefined => {
  const index = findPlanIndex(params.runtime.domain.taskPlans, params.planId)
  if (index < 0) return undefined
  const current = params.runtime.domain.taskPlans[index]
  if (!current) return undefined
  const next = params.update(current)
  for (const key of Object.keys(current) as Array<keyof TaskPlan>)
    if (!(key in next)) delete current[key]
  Object.assign(current, next)
  return next
}
