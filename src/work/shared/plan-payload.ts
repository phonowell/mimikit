import { compactTaskContractForPrompt } from '../../foundation/shared/task-contract-compact.js'

import type {
  TaskContract,
  TaskPlan,
  TaskPlanEffect,
  TaskPlanTrigger,
} from '../../foundation/types/index.js'

const buildTaskContractPayload = (
  contract?: TaskContract,
): Record<string, unknown> | undefined => {
  const compactContract = compactTaskContractForPrompt(contract)
  if (!compactContract) return undefined
  return {
    goal: compactContract.goal,
    scope: compactContract.scope,
    acceptance: compactContract.acceptance,
    ...(compactContract.outOfScope
      ? { out_of_scope: compactContract.outOfScope }
      : {}),
    ...(compactContract.contextRefs
      ? { context_refs: compactContract.contextRefs }
      : {}),
  }
}

export const buildPlanTriggerPayload = (
  trigger: TaskPlanTrigger,
): Record<string, unknown> => ({
  schedule_type: trigger.mode,
  ...(trigger.mode === 'cron'
    ? {
        cron_expr: trigger.cron,
        ...(trigger.timeZone ? { time_zone: trigger.timeZone } : {}),
      }
    : {}),
  ...(trigger.mode === 'scheduled_at'
    ? { scheduled_at: trigger.scheduledAt }
    : {}),
})

export const buildPlanProgressPayload = (
  plan: TaskPlan,
): Record<string, unknown> => ({
  ...(plan.maxRuns !== undefined ? { max_runs: plan.maxRuns } : {}),
  ...(plan.runtime.lastTriggeredAt
    ? { last_triggered_at: plan.runtime.lastTriggeredAt }
    : {}),
  ...(plan.runtime.lastTaskId ? { last_task_id: plan.runtime.lastTaskId } : {}),
  ...(plan.runtime.closedAt ? { closed_at: plan.runtime.closedAt } : {}),
  ...(plan.runtime.doneReason ? { done_reason: plan.runtime.doneReason } : {}),
})

export const buildPlanEffectPayload = (
  effect: TaskPlanEffect,
): Record<string, unknown> => ({
  effect_kind: effect.kind,
  task_title: effect.taskTemplate.title,
  ...(buildTaskContractPayload(effect.taskContract)
    ? { task_contract: buildTaskContractPayload(effect.taskContract) }
    : {}),
  task_cwd: effect.taskTemplate.cwd,
  ...(effect.taskTemplate.resourceMode
    ? { task_resource_mode: effect.taskTemplate.resourceMode }
    : {}),
  ...(effect.taskTemplate.useWorktree ? { task_use_worktree: true } : {}),
  ...(effect.taskTemplate.branch
    ? { task_branch: effect.taskTemplate.branch }
    : {}),
})
