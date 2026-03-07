import { appendHistory } from '../history/store.js'
import {
  buildPlanProgressPayload,
  buildPlanTriggerPayload,
} from '../shared/plan-payload.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { newId, nowIso } from '../shared/utils.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskPlan, TaskPlanTrigger } from '../types/index.js'

const resolvePlanLabel = (item: TaskPlan): string =>
  item.title.trim() || item.id

export const appendPlanSystemMessage = async (
  runtime: RuntimeState,
  event: 'plan_created' | 'plan_updated' | 'plan_deleted',
  plan: TaskPlan,
): Promise<void> => {
  const label = resolvePlanLabel(plan)
  await appendHistory(runtime.paths.history, {
    id: `sys-plan-${newId()}`,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary:
        event === 'plan_created'
          ? `Plan changed: "${label}" (created).`
          : event === 'plan_updated'
            ? `Plan changed: "${label}" (updated).`
            : `Plan changed: "${label}" (deleted).`,
      event,
      payload: {
        plan_id: plan.id,
        title: label,
        status: plan.status,
        priority: plan.priority,
        source: plan.source,
        run_count: plan.runCount,
        ...buildPlanProgressPayload(plan),
        ...buildPlanTriggerPayload(plan.trigger),
      },
    }),
    createdAt: nowIso(),
    focusId: plan.focusId,
  })
}

export const normalizePlanKey = (params: {
  prompt: string
  title: string
  focusId: string
  profile: string
  trigger: TaskPlanTrigger
}): string => {
  const base = `${params.prompt.trim().replace(/\s+/g, ' ').toLowerCase()}\n${params.title.trim().replace(/\s+/g, ' ').toLowerCase()}\n${params.focusId}\n${params.profile}`

  if (params.trigger.mode === 'cron')
    return `${base}\ncron:${params.trigger.cron}`
  if (params.trigger.mode === 'scheduled_at')
    return `${base}\nscheduled_at:${params.trigger.scheduledAt}`
  return `${base}\non_worker_slot_freed`
}

export const buildTrigger = (params: {
  triggerMode: 'cron' | 'scheduled_at' | 'on_worker_slot_freed'
  cron?: string | undefined
  scheduledAt?: string | undefined
}): TaskPlanTrigger => {
  if (params.triggerMode === 'cron') {
    const cron = params.cron?.trim()
    if (!cron) throw new Error('invalid_plan_trigger: cron required')
    return { mode: 'cron', cron }
  }

  if (params.triggerMode === 'scheduled_at') {
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
    triggerMode?: 'cron' | 'scheduled_at' | 'on_worker_slot_freed' | undefined
    cron?: string | undefined
    scheduledAt?: string | undefined
  },
): TaskPlanTrigger => {
  const hasTriggerPatch =
    update.triggerMode !== undefined ||
    update.cron !== undefined ||
    update.scheduledAt !== undefined
  if (!hasTriggerPatch) return current

  const mode = update.triggerMode ?? current.mode

  return buildTrigger({
    triggerMode: mode,
    cron: update.cron ?? (current.mode === 'cron' ? current.cron : undefined),
    scheduledAt:
      update.scheduledAt ??
      (current.mode === 'scheduled_at' ? current.scheduledAt : undefined),
  })
}

export const isDoneLastTaskPatch = (params: {
  current: TaskPlan
  input: {
    last_task_id?: string | undefined
    prompt?: string | undefined
    title?: string | undefined
    trigger_mode?: 'cron' | 'scheduled_at' | 'on_worker_slot_freed' | undefined
    cron?: string | undefined
    scheduled_at?: string | undefined
    max_runs?: number | undefined
    priority?: string | undefined
    source?: string | undefined
    status?: string | undefined
    focus_id?: string | undefined
  }
}): boolean => {
  const { current, input } = params
  return (
    current.status === 'done' &&
    input.last_task_id !== undefined &&
    input.prompt === undefined &&
    input.title === undefined &&
    input.trigger_mode === undefined &&
    input.cron === undefined &&
    input.scheduled_at === undefined &&
    input.max_runs === undefined &&
    input.priority === undefined &&
    input.source === undefined &&
    input.status === undefined &&
    input.focus_id === undefined
  )
}
