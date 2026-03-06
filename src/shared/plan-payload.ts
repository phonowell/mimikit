import type { TaskPlan, TaskPlanTrigger } from '../types/index.js'

export const buildPlanTriggerPayload = (
  trigger: TaskPlanTrigger,
): Record<string, unknown> => ({
  trigger_mode: trigger.mode,
  ...(trigger.mode === 'cron' ? { cron: trigger.cron } : {}),
  ...(trigger.mode === 'scheduled_at'
    ? { scheduled_at: trigger.scheduledAt }
    : {}),
  ...(trigger.mode === 'on_idle' ? { cooldown_ms: trigger.cooldownMs } : {}),
})

export const buildPlanProgressPayload = (
  plan: TaskPlan,
): Record<string, unknown> => ({
  ...(plan.maxRuns !== undefined ? { max_runs: plan.maxRuns } : {}),
  ...(plan.lastTriggeredAt ? { last_triggered_at: plan.lastTriggeredAt } : {}),
  ...(plan.lastCompletedAt ? { last_completed_at: plan.lastCompletedAt } : {}),
  ...(plan.lastTaskId ? { last_task_id: plan.lastTaskId } : {}),
  ...(plan.archivedAt ? { archived_at: plan.archivedAt } : {}),
})
