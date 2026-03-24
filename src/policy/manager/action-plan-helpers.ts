import { newId, nowIso } from '../../foundation/shared/utils.js'
import { appendHistory } from '../../persistence/history/store.js'
import { createSystemEventRecord } from '../../surface/shared/system-event.js'
import {
  buildPlanEffectPayload,
  buildPlanProgressPayload,
  buildPlanTriggerPayload,
} from '../../work/shared/plan-payload.js'

import { buildPlanEffectKey } from './action-plan-effect-key.js'

import type {
  TaskPlan,
  TaskPlanEffect,
  TaskPlanTrigger,
} from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

const resolvePlanLabel = (item: TaskPlan): string =>
  item.title.trim() || item.id

export const appendPlanSystemMessage = async (
  runtime: RuntimeState,
  event: 'plan_created' | 'plan_updated' | 'plan_deleted',
  plan: TaskPlan,
): Promise<void> => {
  const label = resolvePlanLabel(plan)
  const eventRecord = createSystemEventRecord({
    summary:
      event === 'plan_created'
        ? `Plan changed: "${label}" (created).`
        : event === 'plan_updated'
          ? `Plan changed: "${label}" (updated).`
          : `Plan changed: "${label}" (closed).`,
    event,
    payload: {
      plan_id: plan.id,
      title: label,
      status: plan.status,
      priority: plan.priority,
      run_count: plan.runtime.runCount,
      ...buildPlanProgressPayload(plan),
      ...buildPlanTriggerPayload(plan.trigger),
      ...buildPlanEffectPayload(plan.effect),
    },
  })
  await appendHistory(runtime.paths.history, {
    id: `sys-plan-${newId()}`,
    role: 'system',
    visibility: 'user',
    ...eventRecord,
    createdAt: nowIso(),
    focusId: plan.focusId,
  })
}

export const normalizePlanKey = (params: {
  title: string
  focusId: string
  trigger: TaskPlanTrigger
  effect: TaskPlanEffect
}): string => {
  const base = `${params.title.trim().replace(/\s+/g, ' ').toLowerCase()}\n${params.focusId}`
  const effectKey = buildPlanEffectKey({
    effect: params.effect,
    focusId: params.focusId,
  })

  if (params.trigger.mode === 'cron')
    return `${base}\n${effectKey}\ncron:${params.trigger.cron}\ntime_zone:${params.trigger.timeZone ?? ''}`
  if (params.trigger.mode === 'scheduled_at')
    return `${base}\n${effectKey}\nscheduled_at:${params.trigger.scheduledAt}`
  return `${base}\n${effectKey}\non_worker_slot_freed`
}

export const buildTrigger = (params: {
  scheduleType: 'cron' | 'scheduled_at' | 'on_worker_slot_freed'
  cronExpr?: string | undefined
  scheduledAt?: string | undefined
  timeZone?: string | undefined
}): TaskPlanTrigger => {
  if (params.scheduleType === 'cron') {
    const cron = params.cronExpr?.trim()
    const timeZone = params.timeZone?.trim()
    if (!cron) throw new Error('invalid_plan_trigger: cron required')
    if (!timeZone) throw new Error('invalid_plan_trigger: time_zone required')
    return { mode: 'cron', cron, timeZone }
  }

  if (params.scheduleType === 'scheduled_at') {
    const scheduledAt = params.scheduledAt?.trim()
    if (!scheduledAt)
      throw new Error('invalid_plan_trigger: scheduled_at required')
    return { mode: 'scheduled_at', scheduledAt }
  }

  return { mode: 'on_worker_slot_freed' }
}

export const resolveUpdatedTrigger = (
  current: TaskPlanTrigger,
  update: {
    scheduleType?: 'cron' | 'scheduled_at' | 'on_worker_slot_freed' | undefined
    cronExpr?: string | undefined
    scheduledAt?: string | undefined
    timeZone?: string | undefined
  },
): TaskPlanTrigger => {
  const hasTriggerPatch =
    update.scheduleType !== undefined ||
    update.cronExpr !== undefined ||
    update.scheduledAt !== undefined ||
    update.timeZone !== undefined
  if (!hasTriggerPatch) return current

  const mode = update.scheduleType ?? current.mode

  return buildTrigger({
    scheduleType: mode,
    cronExpr:
      update.cronExpr ?? (current.mode === 'cron' ? current.cron : undefined),
    scheduledAt:
      update.scheduledAt ??
      (current.mode === 'scheduled_at' ? current.scheduledAt : undefined),
    timeZone:
      update.timeZone ??
      (current.mode === 'cron' ? current.timeZone : undefined),
  })
}
