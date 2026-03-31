import {
  buildPlanEffectPayload,
  buildPlanProgressPayload,
  buildPlanTriggerPayload,
} from '../../work/shared/plan-payload.js'

import { escapeCdata, stringifyPromptJson } from './format-base.js'

import type { TaskPlan } from '../types/index.js'

export type PlanPromptPayloadOptions = {
  workingFocusIds?: string[] | undefined
  latestResultTaskId?: string | undefined
}

export type PromptSelectionSummary = {
  selected: number
  full: number
  card: number
}

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

export const buildPlansPromptPayloadSection = (
  plans: TaskPlan[],
  _options?: PlanPromptPayloadOptions,
): {
  payload?: { plans: Record<string, unknown>[] } | undefined
  selection: PromptSelectionSummary
} => {
  if (plans.length === 0)
    return { payload: undefined, selection: { selected: 0, full: 0, card: 0 } }

  return {
    payload: { plans: plans.map(formatPlanEntry) },
    selection: { selected: plans.length, full: plans.length, card: 0 },
  }
}

export const buildPlansPromptPayload = (
  plans: TaskPlan[],
  options?: PlanPromptPayloadOptions,
): { plans: Record<string, unknown>[] } | undefined =>
  buildPlansPromptPayloadSection(plans, options).payload

export const formatPlansJson = (plans: TaskPlan[]): string => {
  const payload = buildPlansPromptPayload(plans)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}
