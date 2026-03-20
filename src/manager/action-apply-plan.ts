import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { newId, nowIso } from '../shared/utils.js'

import {
  createPlanSchema,
  deletePlanSchema,
  updatePlanSchema,
} from './action-apply-schema.js'
import { resolveActionFocusId } from './action-focus-id.js'
import { parseActionAttrs } from './action-parse.js'
import {
  appendPlanSystemMessage,
  buildTrigger,
  normalizePlanKey,
  resolveUpdatedTrigger,
} from './action-plan-helpers.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { PlanPriority, PlanSource, TaskPlan } from '../types/index.js'

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
  const focusId = resolveActionFocusId(runtime, parsed.focus_id)
  const key = normalizePlanKey({
    prompt: parsed.prompt,
    title: parsed.title,
    focusId,
    profile: 'worker',
    trigger,
  })

  const exists = runtime.taskPlans.some(
    (plan) =>
      plan.status !== 'done' &&
      normalizePlanKey({
        prompt: plan.prompt,
        title: plan.title,
        focusId: plan.focusId,
        profile: plan.profile,
        trigger: plan.trigger,
      }) === key,
  )
  if (exists) return

  const timestamp = nowIso()
  const maxRuns = parsed.max_runs

  const plan: TaskPlan = {
    id: `plan-${newId()}`,
    prompt: parsed.prompt,
    title: parsed.title,
    focusId,
    profile: 'worker',
    priority: (parsed.priority ?? 'normal') as PlanPriority,
    source: (parsed.source ?? 'user_request') as PlanSource,
    status: 'active',
    trigger,
    createdAt: timestamp,
    updatedAt: timestamp,
    runCount: 0,
    ...(maxRuns !== undefined ? { maxRuns } : {}),
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

  const updatedAt = nowIso()
  const next: TaskPlan = {
    ...current,
    ...(parsed.prompt !== undefined ? { prompt: parsed.prompt } : {}),
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    ...(parsed.priority !== undefined ? { priority: parsed.priority } : {}),
    ...(parsed.source !== undefined ? { source: parsed.source } : {}),
    ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    ...(parsed.max_runs !== undefined ? { maxRuns: parsed.max_runs } : {}),
    trigger,
    focusId: nextFocusId,
    updatedAt,
  }

  if (next.status === 'done') {
    next.archivedAt = updatedAt
    next.doneReason = next.doneReason ?? 'completed'
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
