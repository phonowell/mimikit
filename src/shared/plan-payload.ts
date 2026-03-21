import type {
  TaskPlan,
  TaskPlanEffect,
  TaskPlanTrigger,
} from '../types/index.js'

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
  ...(plan.lastTriggeredAt ? { last_triggered_at: plan.lastTriggeredAt } : {}),
  ...(plan.lastTaskId ? { last_task_id: plan.lastTaskId } : {}),
  ...(plan.closedAt ? { closed_at: plan.closedAt } : {}),
})

export const buildPlanEffectPayload = (
  effect: TaskPlanEffect,
): Record<string, unknown> =>
  effect.kind === 'enqueue_task'
    ? {
        effect_kind: effect.kind,
        task_title: effect.taskTemplate.title,
        task_prompt: effect.taskTemplate.prompt,
        task_cwd: effect.taskTemplate.cwd,
        ...(effect.taskTemplate.branch
          ? { task_branch: effect.taskTemplate.branch }
          : {}),
        task_goal: effect.taskTemplate.contract.goal,
        task_scope: effect.taskTemplate.contract.scope,
        task_acceptance: effect.taskTemplate.contract.acceptance,
        ...(effect.taskTemplate.contract.outOfScope
          ? { task_out_of_scope: effect.taskTemplate.contract.outOfScope }
          : {}),
        ...(effect.taskTemplate.contract.contextRefs
          ? { task_context_refs: effect.taskTemplate.contract.contextRefs }
          : {}),
      }
    : {
        effect_kind: effect.kind,
        effect_reason: effect.reason,
      }
