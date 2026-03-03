import { appendHistory } from '../history/store.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { newId, nowIso } from '../shared/utils.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  TaskPlan,
  TaskPlanTrigger,
} from '../types/index.js'

const resolvePlanLabel = (item: TaskPlan): string =>
  item.title.trim() || item.id

const planTriggerPayload = (
  trigger: TaskPlanTrigger,
): Record<string, unknown> => {
  if (trigger.mode === 'cron') return { trigger_mode: 'cron', cron: trigger.cron }
  if (trigger.mode === 'scheduled_at')
    return { trigger_mode: 'scheduled_at', scheduled_at: trigger.scheduledAt }
  if (trigger.mode === 'on_idle')
    return { trigger_mode: 'on_idle', cooldown_ms: trigger.cooldownMs }
  return { trigger_mode: 'on_worker_slot_available' }
}

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
        ...(plan.maxRuns !== undefined ? { max_runs: plan.maxRuns } : {}),
        ...(plan.lastTriggeredAt
          ? { last_triggered_at: plan.lastTriggeredAt }
          : {}),
        ...(plan.lastCompletedAt
          ? { last_completed_at: plan.lastCompletedAt }
          : {}),
        ...(plan.lastTaskId ? { last_task_id: plan.lastTaskId } : {}),
        ...(plan.archivedAt ? { archived_at: plan.archivedAt } : {}),
        ...planTriggerPayload(plan.trigger),
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
  const base = `${params.prompt.trim().replace(/\s+/g, ' ').toLowerCase()}\n${params.title
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()}\n${params.focusId}\n${params.profile}`

  if (params.trigger.mode === 'cron') return `${base}\ncron:${params.trigger.cron}`
  if (params.trigger.mode === 'scheduled_at')
    return `${base}\nscheduled_at:${params.trigger.scheduledAt}`
  if (params.trigger.mode === 'on_idle')
    return `${base}\non_idle:${params.trigger.cooldownMs}`
  return `${base}\non_worker_slot_available`
}

export const buildTrigger = (params: {
  triggerMode:
    | 'cron'
    | 'scheduled_at'
    | 'on_idle'
    | 'on_worker_slot_available'
  cron?: string | undefined
  scheduledAt?: string | undefined
  cooldownMs?: number | undefined
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

  if (params.triggerMode === 'on_worker_slot_available')
    return { mode: 'on_worker_slot_available' }

  return {
    mode: 'on_idle',
    cooldownMs: Math.max(0, params.cooldownMs ?? 0),
  }
}

export const resolveUpdatedTrigger = (
  current: TaskPlanTrigger,
  update: {
    triggerMode?:
      | 'cron'
      | 'scheduled_at'
      | 'on_idle'
      | 'on_worker_slot_available'
      | undefined
    cron?: string | undefined
    scheduledAt?: string | undefined
    cooldownMs?: number | undefined
  },
): TaskPlanTrigger => {
  const hasTriggerPatch =
    update.triggerMode !== undefined ||
    update.cron !== undefined ||
    update.scheduledAt !== undefined ||
    update.cooldownMs !== undefined
  if (!hasTriggerPatch) return current

  const mode =
    update.triggerMode ??
    (update.cron !== undefined
      ? 'cron'
      : update.scheduledAt !== undefined
        ? 'scheduled_at'
        : update.cooldownMs !== undefined
          ? 'on_idle'
          : current.mode)

  return buildTrigger({
    triggerMode: mode,
    cron:
      update.cron ?? (current.mode === 'cron' ? current.cron : undefined),
    scheduledAt:
      update.scheduledAt ??
      (current.mode === 'scheduled_at' ? current.scheduledAt : undefined),
    cooldownMs:
      update.cooldownMs ??
      (current.mode === 'on_idle' ? current.cooldownMs : undefined),
  })
}

export const isDoneLastTaskPatch = (params: {
  current: TaskPlan
  input: {
    last_task_id?: string | undefined
    prompt?: string | undefined
    title?: string | undefined
    trigger_mode?:
      | 'cron'
      | 'scheduled_at'
      | 'on_idle'
      | 'on_worker_slot_available'
      | undefined
    cron?: string | undefined
    scheduled_at?: string | undefined
    cooldown_ms?: number | undefined
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
    input.cooldown_ms === undefined &&
    input.max_runs === undefined &&
    input.priority === undefined &&
    input.source === undefined &&
    input.status === undefined &&
    input.focus_id === undefined
  )
}
