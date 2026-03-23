import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { newId, nowIso } from '../shared/utils.js'

import {
  createPlanSchema,
  deletePlanSchema,
  updatePlanSchema,
} from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { parseActionAttrs } from './action-parse.js'
import { buildPlanEffect, resolveUpdatedEffect } from './action-plan-effect.js'
import {
  appendPlanSystemMessage,
  buildTrigger,
  normalizePlanKey,
  resolveUpdatedTrigger,
} from './action-plan-helpers.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { PlanPriority, TaskPlan } from '../types/index.js'

export const applyCreatePlan = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, createPlanSchema)
  if (!parsed) return

  const trigger = buildTrigger({
    scheduleType: parsed.schedule_type,
    cronExpr: parsed.cron_expr,
    scheduledAt: parsed.scheduled_at,
    timeZone: parsed.time_zone,
  })
  const effect = buildPlanEffect(parsed)
  const focusId = resolveActionFocusId(runtime, parsed.focus_id)
  const key = normalizePlanKey({
    title: parsed.title,
    focusId,
    trigger,
    effect,
  })

  const exists = runtime.taskPlans.some(
    (plan) =>
      plan.status !== 'done' &&
      normalizePlanKey({
        title: plan.title,
        focusId: plan.focusId,
        trigger: plan.trigger,
        effect: plan.effect,
      }) === key,
  )
  if (exists) return

  const timestamp = nowIso()
  const maxRuns = parsed.max_runs

  const plan: TaskPlan = {
    id: `plan-${newId()}`,
    title: parsed.title,
    focusId,
    priority: (parsed.priority ?? 'normal') as PlanPriority,
    status: 'active',
    trigger,
    effect,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(maxRuns !== undefined ? { maxRuns } : {}),
    runtime: {
      runCount: 0,
    },
  }

  runtime.taskPlans.push(plan)
  await persistRuntimeState(runtime)
  await appendPlanSystemMessage(runtime, 'plan_created', plan)
}

export const applyUpdatePlan = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, updatePlanSchema)
  if (!parsed) return

  const index = runtime.taskPlans.findIndex((plan) => plan.id === parsed.id)
  if (index < 0) return
  const current = runtime.taskPlans[index]
  if (!current) return
  if (current.status === 'done') return

  const nextFocusId =
    parsed.focus_id !== undefined
      ? resolveActionFocusId(runtime, parsed.focus_id)
      : current.focusId

  const trigger = resolveUpdatedTrigger(current.trigger, {
    scheduleType: parsed.schedule_type,
    cronExpr: parsed.cron_expr,
    scheduledAt: parsed.scheduled_at,
    timeZone: parsed.time_zone,
  })
  const effect = resolveUpdatedEffect(current.effect, parsed)

  const updatedAt = nowIso()
  const next: TaskPlan = {
    ...current,
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
    ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    ...(parsed.max_runs !== undefined ? { maxRuns: parsed.max_runs } : {}),
    trigger,
    effect,
    focusId: nextFocusId,
    updatedAt,
  }

  if (next.status !== 'done') {
    const key = normalizePlanKey({
      title: next.title,
      focusId: next.focusId,
      trigger: next.trigger,
      effect: next.effect,
    })
    const collides = runtime.taskPlans.some(
      (plan) =>
        plan.id !== current.id &&
        plan.status !== 'done' &&
        normalizePlanKey({
          title: plan.title,
          focusId: plan.focusId,
          trigger: plan.trigger,
          effect: plan.effect,
        }) === key,
    )
    if (collides) return
  }

  if (next.status === 'done') {
    next.runtime = {
      ...next.runtime,
      closedAt: updatedAt,
      doneReason: next.runtime.doneReason ?? 'completed',
    }
  }

  runtime.taskPlans[index] = next
  await persistRuntimeState(runtime)
  await appendPlanSystemMessage(runtime, 'plan_updated', next)
}

export const applyDeletePlan = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = parseActionAttrs(item, deletePlanSchema)
  if (!parsed) return

  const index = runtime.taskPlans.findIndex((plan) => plan.id === parsed.id)
  if (index < 0) return

  const [removed] = runtime.taskPlans.splice(index, 1)
  if (!removed) return

  await persistRuntimeState(runtime)
  await appendPlanSystemMessage(runtime, 'plan_deleted', removed)
}
