import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { newId, nowIso } from '../shared/utils.js'

import { resolveActionFocusId } from './action-apply-create.js'
import {
  createPlanSchema,
  deletePlanSchema,
  updatePlanSchema,
} from './action-apply-schema.js'
import {
  appendPlanSystemMessage,
  buildTrigger,
  isDoneLastTaskPatch,
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
  const parsed = createPlanSchema.safeParse(item.attrs)
  if (!parsed.success) return

  const trigger = buildTrigger({
    triggerMode: parsed.data.trigger_mode,
    cron: parsed.data.cron,
    scheduledAt: parsed.data.scheduled_at,
  })
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const key = normalizePlanKey({
    prompt: parsed.data.prompt,
    title: parsed.data.title,
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
  const maxRuns = parsed.data.max_runs

  const plan: TaskPlan = {
    id: `plan-${newId()}`,
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    focusId,
    profile: 'worker',
    priority: (parsed.data.priority ?? 'normal') as PlanPriority,
    source: (parsed.data.source ?? 'user_request') as PlanSource,
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
  const parsed = updatePlanSchema.safeParse(item.attrs)
  if (!parsed.success) return

  const index = runtime.taskPlans.findIndex(
    (plan) => plan.id === parsed.data.id,
  )
  if (index < 0) return
  const current = runtime.taskPlans[index]
  if (!current) return

  const doneLastTaskPatch = isDoneLastTaskPatch({
    current,
    input: parsed.data,
  })
  if (current.status === 'done' && !doneLastTaskPatch) return

  const nextFocusId =
    parsed.data.focus_id !== undefined
      ? resolveActionFocusId(runtime, parsed.data.focus_id)
      : current.focusId

  const trigger = resolveUpdatedTrigger(current.trigger, {
    triggerMode: parsed.data.trigger_mode,
    cron: parsed.data.cron,
    scheduledAt: parsed.data.scheduled_at,
  })

  const updatedAt = nowIso()
  const next: TaskPlan = {
    ...current,
    ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.priority !== undefined
      ? { priority: parsed.data.priority }
      : {}),
    ...(parsed.data.source !== undefined ? { source: parsed.data.source } : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.last_task_id !== undefined
      ? { lastTaskId: parsed.data.last_task_id }
      : {}),
    ...(parsed.data.max_runs !== undefined
      ? { maxRuns: parsed.data.max_runs }
      : {}),
    trigger,
    focusId: nextFocusId,
    updatedAt,
  }

  if (next.status === 'done' && current.status !== 'done') {
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
  const parsed = deletePlanSchema.safeParse(item.attrs)
  if (!parsed.success) return

  const index = runtime.taskPlans.findIndex(
    (plan) => plan.id === parsed.data.id,
  )
  if (index < 0) return

  const [removed] = runtime.taskPlans.splice(index, 1)
  if (!removed) return

  await persistRuntimeState(runtime)
  await appendPlanSystemMessage(runtime, 'plan_deleted', removed)
}
