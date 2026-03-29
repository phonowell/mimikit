import { sortTaskPlansForView } from './plan-select.js'

import type {
  TaskContract,
  TaskPlan,
  TaskPlanTrigger,
} from '../../foundation/types/index.js'

export type PlanTaskContractView = {
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string
  contextRefs?: string[]
}

export type PlanView = {
  id: string
  title: string
  status: TaskPlan['status']
  updatedAt: string
  archivedAt?: string
  lastTaskId?: string
  trigger: TaskPlanTrigger
  taskContract?: PlanTaskContractView
}

const resolvePlanViewTitle = (plan: TaskPlan): string => {
  const title = plan.title.trim()
  return title || plan.id
}

const clonePlanTrigger = (trigger: TaskPlanTrigger): TaskPlanTrigger => {
  if (trigger.mode === 'cron') {
    return {
      mode: 'cron',
      cron: trigger.cron,
      ...(trigger.timeZone ? { timeZone: trigger.timeZone } : {}),
    }
  }
  if (trigger.mode === 'scheduled_at') {
    return {
      mode: 'scheduled_at',
      scheduledAt: trigger.scheduledAt,
    }
  }
  return { mode: 'on_worker_slot_freed' }
}

const clonePlanTaskContract = (
  contract?: TaskContract,
): PlanTaskContractView | undefined => {
  if (!contract) return undefined
  return {
    goal: contract.goal,
    scope: contract.scope,
    acceptance: [...contract.acceptance],
    ...(contract.outOfScope ? { outOfScope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { contextRefs: [...contract.contextRefs] } : {}),
  }
}

const planToView = (plan: TaskPlan): PlanView => {
  const taskContract = clonePlanTaskContract(plan.effect.taskContract)
  return {
    id: plan.id,
    title: resolvePlanViewTitle(plan),
    status: plan.status,
    updatedAt: plan.updatedAt,
    ...(plan.runtime.closedAt ? { archivedAt: plan.runtime.closedAt } : {}),
    ...(plan.runtime.lastTaskId ? { lastTaskId: plan.runtime.lastTaskId } : {}),
    trigger: clonePlanTrigger(plan.trigger),
    ...(taskContract ? { taskContract } : {}),
  }
}

export const buildPlanViews = (
  plans: TaskPlan[],
  limit = 200,
): { items: PlanView[] } => ({
  items: sortTaskPlansForView(plans)
    .slice(0, Math.max(0, limit))
    .map((plan) => planToView(plan)),
})
