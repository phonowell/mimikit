import {
  buildPlanEffectPayload,
  buildPlanProgressPayload,
  buildPlanTriggerPayload,
} from '../shared/plan-payload.js'

import { escapeCdata, stringifyPromptJson } from './format-base.js'

import type { TaskPlan } from '../types/index.js'

const formatPlanEntry = (plan: TaskPlan): Record<string, unknown> => ({
  id: plan.id,
  status: plan.status,
  priority: plan.priority,
  title: plan.title.trim() || plan.id,
  created_at: plan.createdAt,
  updated_at: plan.updatedAt,
  run_count: plan.runtime.runCount,
  ...buildPlanProgressPayload(plan),
  ...buildPlanTriggerPayload(plan.trigger),
  ...buildPlanEffectPayload(plan.effect),
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
