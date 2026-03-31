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

const formatPlanCard = (plan: TaskPlan): Record<string, unknown> => ({
  id: plan.id,
  status: plan.status,
  priority: plan.priority,
  title: plan.title.trim() || plan.id,
  created_at: plan.createdAt,
  updated_at: plan.updatedAt,
  run_count: plan.runtime.runCount,
  ...buildPlanProgressPayload(plan),
  ...buildPlanTriggerPayload(plan.trigger),
})

const shouldExpandPlanEntry = (
  plan: TaskPlan,
  options?: PlanPromptPayloadOptions,
): boolean => {
  if (!options) return true
  if (plan.status === 'active' || plan.status === 'blocked') return true
  if (
    options.latestResultTaskId &&
    plan.runtime.lastTaskId === options.latestResultTaskId
  )
    return true
  if (options.workingFocusIds?.includes(plan.focusId)) return true
  return false
}

export const buildPlansPromptPayloadSection = (
  plans: TaskPlan[],
  options?: PlanPromptPayloadOptions,
): {
  payload?: { plans: Record<string, unknown>[] } | undefined
  selection: PromptSelectionSummary
} => {
  if (plans.length === 0)
    return { payload: undefined, selection: { selected: 0, full: 0, card: 0 } }

  let full = 0
  let card = 0
  const entries = plans.map((plan) => {
    if (shouldExpandPlanEntry(plan, options)) {
      full += 1
      return formatPlanEntry(plan)
    }
    card += 1
    return formatPlanCard(plan)
  })

  return {
    payload: { plans: entries },
    selection: { selected: entries.length, full, card },
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
