import { sortTaskPlansForView } from './plan-select.js'

import type {
  TaskContract,
  TaskPlan,
  TaskPlanStageDigest,
  TaskPlanTrigger,
} from '../../foundation/types/index.js'

export type PlanTaskContractView = {
  goal: string
  scope: string
  acceptance: string[]
  outOfScope?: string
  contextRefs?: string[]
}

export type PlanStageView = {
  summary: string
  risk?: string
  needsDecision: boolean
  sourceTaskId: string
  updatedAt: string
}

export type PlanView = {
  id: string
  title: string
  status: TaskPlan['status']
  updatedAt: string
  runCount: number
  archivedAt?: string
  lastTriggeredAt?: string
  lastTaskId?: string
  doneReason?: TaskPlan['runtime']['doneReason']
  trigger: TaskPlanTrigger
  taskContract?: PlanTaskContractView
  stage?: PlanStageView
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

const clonePlanStage = (
  stage?: TaskPlanStageDigest,
): PlanStageView | undefined => {
  if (!stage) return undefined
  return {
    summary: stage.summary,
    ...(stage.risk ? { risk: stage.risk } : {}),
    needsDecision: stage.needsDecision,
    sourceTaskId: stage.sourceTaskId,
    updatedAt: stage.updatedAt,
  }
}

const planToView = (plan: TaskPlan): PlanView => {
  const taskContract = clonePlanTaskContract(plan.effect.taskContract)
  const stage = clonePlanStage(plan.runtime.stage)
  return {
    id: plan.id,
    title: resolvePlanViewTitle(plan),
    status: plan.status,
    updatedAt: plan.updatedAt,
    runCount: plan.runtime.runCount,
    ...(plan.runtime.closedAt ? { archivedAt: plan.runtime.closedAt } : {}),
    ...(plan.runtime.lastTriggeredAt
      ? { lastTriggeredAt: plan.runtime.lastTriggeredAt }
      : {}),
    ...(plan.runtime.lastTaskId ? { lastTaskId: plan.runtime.lastTaskId } : {}),
    ...(plan.runtime.doneReason ? { doneReason: plan.runtime.doneReason } : {}),
    trigger: clonePlanTrigger(plan.trigger),
    ...(taskContract ? { taskContract } : {}),
    ...(stage ? { stage } : {}),
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
