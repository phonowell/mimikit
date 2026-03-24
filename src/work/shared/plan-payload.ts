import type {
  TaskPlan,
  TaskPlanEffect,
  TaskPlanTrigger,
} from '../../foundation/types/index.js'

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
): Record<string, unknown> =>
  effect.kind === 'enqueue_task'
    ? {
        effect_kind: effect.kind,
        task_title: effect.taskTemplate.title,
        task_cwd: effect.taskTemplate.cwd,
        ...(effect.taskTemplate.branch
          ? { task_branch: effect.taskTemplate.branch }
          : {}),
      }
    : {
        effect_kind: effect.kind,
        effect_reason: effect.reason,
      }
