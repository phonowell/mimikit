import { appendHistory } from '../history/store.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { newId, nowIso } from '../shared/utils.js'

import {
  createTemplateSchema,
  deleteTemplateSchema,
  updateTemplateSchema,
} from './action-apply-schema.js'
import { resolveActionFocusId } from './action-apply-create.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  TaskTemplate,
  TaskTemplateTrigger,
  TemplatePriority,
  TemplateSource,
} from '../types/index.js'

const resolveTemplateLabel = (item: TaskTemplate): string =>
  item.title.trim() || item.id

const templateTriggerPayload = (
  trigger: TaskTemplateTrigger,
): Record<string, unknown> => {
  if (trigger.mode === 'cron') return { trigger_mode: 'cron', cron: trigger.cron }
  if (trigger.mode === 'scheduled_at')
    return { trigger_mode: 'scheduled_at', scheduled_at: trigger.scheduledAt }
  return { trigger_mode: 'on_idle', cooldown_ms: trigger.cooldownMs }
}

const appendTemplateSystemMessage = async (
  runtime: RuntimeState,
  event: 'template_created' | 'template_updated' | 'template_deleted',
  template: TaskTemplate,
): Promise<void> => {
  const label = resolveTemplateLabel(template)
  await appendHistory(runtime.paths.history, {
    id: `sys-template-${newId()}`,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary:
        event === 'template_created'
          ? `Template changed: "${label}" (created).`
          : event === 'template_updated'
            ? `Template changed: "${label}" (updated).`
            : `Template changed: "${label}" (deleted).`,
      event,
      payload: {
        template_id: template.id,
        title: label,
        status: template.status,
        priority: template.priority,
        source: template.source,
        run_count: template.runCount,
        ...(template.maxRuns !== undefined ? { max_runs: template.maxRuns } : {}),
        ...(template.lastTriggeredAt
          ? { last_triggered_at: template.lastTriggeredAt }
          : {}),
        ...(template.lastCompletedAt
          ? { last_completed_at: template.lastCompletedAt }
          : {}),
        ...(template.lastTaskId ? { last_task_id: template.lastTaskId } : {}),
        ...(template.archivedAt ? { archived_at: template.archivedAt } : {}),
        ...templateTriggerPayload(template.trigger),
      },
    }),
    createdAt: nowIso(),
    focusId: template.focusId,
  })
}

const normalizeTemplateKey = (params: {
  prompt: string
  title: string
  focusId: string
  profile: string
  trigger: TaskTemplateTrigger
}): string => {
  const base = `${params.prompt.trim().replace(/\s+/g, ' ').toLowerCase()}\n${params.title
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()}\n${params.focusId}\n${params.profile}`
  if (params.trigger.mode === 'cron') return `${base}\ncron:${params.trigger.cron}`
  if (params.trigger.mode === 'scheduled_at')
    return `${base}\nscheduled_at:${params.trigger.scheduledAt}`
  return `${base}\non_idle:${params.trigger.cooldownMs}`
}

const buildTrigger = (params: {
  triggerMode: 'cron' | 'scheduled_at' | 'on_idle'
  cron?: string | undefined
  scheduledAt?: string | undefined
  cooldownMs?: number | undefined
}): TaskTemplateTrigger => {
  if (params.triggerMode === 'cron') {
    const cron = params.cron?.trim()
    if (!cron) throw new Error('invalid_template_trigger: cron required')
    return { mode: 'cron', cron }
  }
  if (params.triggerMode === 'scheduled_at') {
    const scheduledAt = params.scheduledAt?.trim()
    if (!scheduledAt)
      throw new Error('invalid_template_trigger: scheduled_at required')
    return { mode: 'scheduled_at', scheduledAt }
  }
  return {
    mode: 'on_idle',
    cooldownMs: Math.max(0, params.cooldownMs ?? 0),
  }
}

const resolveUpdatedTrigger = (
  current: TaskTemplateTrigger,
  update: {
    triggerMode?: 'cron' | 'scheduled_at' | 'on_idle' | undefined
    cron?: string | undefined
    scheduledAt?: string | undefined
    cooldownMs?: number | undefined
  },
): TaskTemplateTrigger => {
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

export const applyCreateTemplate = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = createTemplateSchema.safeParse(item.attrs)
  if (!parsed.success) return

  const trigger = buildTrigger({
    triggerMode: parsed.data.trigger_mode,
    cron: parsed.data.cron,
    scheduledAt: parsed.data.scheduled_at,
    cooldownMs: parsed.data.cooldown_ms,
  })
  const focusId = resolveActionFocusId(runtime, parsed.data.focus_id)
  const key = normalizeTemplateKey({
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    focusId,
    profile: 'worker',
    trigger,
  })
  const exists = runtime.taskTemplates.some(
    (template) =>
      template.status !== 'done' &&
      normalizeTemplateKey({
        prompt: template.prompt,
        title: template.title,
        focusId: template.focusId,
        profile: template.profile,
        trigger: template.trigger,
      }) === key,
  )
  if (exists) return

  const timestamp = nowIso()
  const maxRuns =
    parsed.data.max_runs ??
    (trigger.mode === 'on_idle' ? 1 : undefined)

  const template: TaskTemplate = {
    id: `tpl-${newId()}`,
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    focusId,
    profile: 'worker',
    priority: (parsed.data.priority ?? 'normal') as TemplatePriority,
    source: (parsed.data.source ?? 'user_request') as TemplateSource,
    status: 'active',
    trigger,
    createdAt: timestamp,
    updatedAt: timestamp,
    runCount: 0,
    ...(maxRuns !== undefined ? { maxRuns } : {}),
  }

  runtime.taskTemplates.push(template)
  await persistRuntimeState(runtime)
  await appendTemplateSystemMessage(runtime, 'template_created', template)
}

export const applyUpdateTemplate = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = updateTemplateSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const index = runtime.taskTemplates.findIndex(
    (template) => template.id === parsed.data.id,
  )
  if (index < 0) return
  const current = runtime.taskTemplates[index]
  if (!current) return
  const isDoneLastTaskPatch =
    current.status === 'done' &&
    parsed.data.last_task_id !== undefined &&
    parsed.data.prompt === undefined &&
    parsed.data.title === undefined &&
    parsed.data.trigger_mode === undefined &&
    parsed.data.cron === undefined &&
    parsed.data.scheduled_at === undefined &&
    parsed.data.cooldown_ms === undefined &&
    parsed.data.max_runs === undefined &&
    parsed.data.priority === undefined &&
    parsed.data.source === undefined &&
    parsed.data.status === undefined &&
    parsed.data.focus_id === undefined
  if (current.status === 'done' && !isDoneLastTaskPatch) return

  const nextFocusId =
    parsed.data.focus_id !== undefined
      ? resolveActionFocusId(runtime, parsed.data.focus_id)
      : current.focusId
  const trigger = resolveUpdatedTrigger(current.trigger, {
    triggerMode: parsed.data.trigger_mode,
    cron: parsed.data.cron,
    scheduledAt: parsed.data.scheduled_at,
    cooldownMs: parsed.data.cooldown_ms,
  })

  const updatedAt = nowIso()
  const next: TaskTemplate = {
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
    ...(parsed.data.max_runs !== undefined ? { maxRuns: parsed.data.max_runs } : {}),
    trigger,
    focusId: nextFocusId,
    updatedAt,
  }
  if (next.status === 'done' && current.status !== 'done') {
    next.archivedAt = updatedAt
    next.doneReason = next.doneReason ?? 'completed'
  }
  runtime.taskTemplates[index] = next
  await persistRuntimeState(runtime)
  await appendTemplateSystemMessage(runtime, 'template_updated', next)
}

export const applyDeleteTemplate = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = deleteTemplateSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const index = runtime.taskTemplates.findIndex(
    (template) => template.id === parsed.data.id,
  )
  if (index < 0) return
  const [removed] = runtime.taskTemplates.splice(index, 1)
  if (!removed) return
  await persistRuntimeState(runtime)
  await appendTemplateSystemMessage(runtime, 'template_deleted', removed)
}
