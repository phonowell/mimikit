import { buildTaskContractPromptPayload } from '../../foundation/prompting/task-contract-prompt-payload.js'

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
  ...(plan.runtime.stage
    ? {
        stage: {
          summary: plan.runtime.stage.summary,
          ...(plan.runtime.stage.risk ? { risk: plan.runtime.stage.risk } : {}),
          needs_decision: plan.runtime.stage.needsDecision,
          source_task_id: plan.runtime.stage.sourceTaskId,
          updated_at: plan.runtime.stage.updatedAt,
        },
      }
    : {}),
  ...(plan.runtime.closedAt ? { closed_at: plan.runtime.closedAt } : {}),
  ...(plan.runtime.doneReason ? { done_reason: plan.runtime.doneReason } : {}),
})

export const buildPlanEffectPayload = (
  effect: TaskPlanEffect,
): Record<string, unknown> => {
  const taskContract = buildTaskContractPromptPayload(effect.taskContract)
  return {
    effect_kind: effect.kind,
    task_title: effect.taskTemplate.title,
    ...(taskContract ? { task_contract: taskContract } : {}),
    task_cwd: effect.taskTemplate.cwd,
    ...(effect.taskTemplate.resourceMode
      ? { task_resource_mode: effect.taskTemplate.resourceMode }
      : {}),
    ...(effect.taskTemplate.useWorktree ? { task_use_worktree: true } : {}),
    ...(effect.taskTemplate.branch
      ? { task_branch: effect.taskTemplate.branch }
      : {}),
  }
}
