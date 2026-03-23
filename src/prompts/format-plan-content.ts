import {
  buildPlanEffectPayload,
  buildPlanProgressPayload,
  buildPlanTriggerPayload,
} from '../shared/plan-payload.js'
import { truncateText } from '../shared/text.js'

import { escapeCdata, stringifyPromptJson } from './format-base.js'

import type { TaskPlan } from '../types/index.js'

const PLAN_PROMPT_MAX_CHARS = 220

const formatPlanEntry = (plan: TaskPlan): Record<string, unknown> => ({
  id: plan.id,
  status: plan.status,
  priority: plan.priority,
  title: plan.title.trim() || plan.id,
  ...(plan.effect.kind === 'enqueue_task'
    ? {
        task_prompt: truncateText(
          plan.effect.taskTemplate.prompt,
          PLAN_PROMPT_MAX_CHARS,
          {
            normalizeWhitespace: true,
          },
        ),
      }
    : {}),
  created_at: plan.createdAt,
  updated_at: plan.updatedAt,
  run_count: plan.runtime.runCount,
  ...buildPlanProgressPayload(plan),
  ...buildPlanTriggerPayload(plan.trigger),
  ...buildPlanEffectPayload(plan.effect),
  ...(plan.runtime.doneReason ? { done_reason: plan.runtime.doneReason } : {}),
})

export const buildPlansPromptPayload = (
  plans: TaskPlan[],
): { plans: Record<string, unknown>[] } | undefined =>
  plans.length === 0 ? undefined : { plans: plans.map(formatPlanEntry) }

export const formatPlansJson = (plans: TaskPlan[]): string => {
  const payload = buildPlansPromptPayload(plans)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}
