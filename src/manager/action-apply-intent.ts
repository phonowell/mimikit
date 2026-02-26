import {
  ensureFocus,
  resolveDefaultFocusId,
  touchFocus,
} from '../focus/index.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { newId, nowIso } from '../shared/utils.js'
import { appendHistory } from '../history/store.js'

import {
  createIntentSchema,
  deleteIntentSchema,
  updateIntentSchema,
} from './action-apply-schema.js'

import type { Parsed } from '../actions/model/spec.js'
import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, IdleIntent } from '../types/index.js'

const resolveIntentLabel = (intent: IdleIntent): string =>
  intent.title.trim() || intent.id

const appendIntentSystemMessage = async (
  runtime: RuntimeState,
  event: 'intent_created' | 'intent_updated' | 'intent_deleted',
  intent: IdleIntent,
): Promise<void> => {
  const label = resolveIntentLabel(intent)
  await appendHistory(runtime.paths.history, {
    id: `sys-intent-${newId()}`,
    role: 'system',
    visibility: 'user',
    text: formatSystemEventText({
      summary:
        event === 'intent_created'
          ? `Intent changed: "${label}" (created).`
          : event === 'intent_updated'
            ? `Intent changed: "${label}" (updated).`
            : `Intent changed: "${label}" (deleted).`,
      event,
      payload: {
        intent_id: intent.id,
        title: label,
        status: intent.status,
        priority: intent.priority,
        source: intent.source,
        trigger_mode: intent.triggerPolicy.mode,
        cooldown_ms: intent.triggerPolicy.cooldownMs,
        total_triggered: intent.triggerState.totalTriggered,
        ...(intent.triggerState.lastCompletedAt
          ? { last_completed_at: intent.triggerState.lastCompletedAt }
          : {}),
        ...(intent.lastTaskId ? { last_task_id: intent.lastTaskId } : {}),
        ...(intent.archivedAt ? { archived_at: intent.archivedAt } : {}),
      },
    }),
    createdAt: nowIso(),
    focusId: intent.focusId,
  })
}

const normalizeIntentKey = (prompt: string, title: string): string =>
  `${prompt.trim().replace(/\s+/g, ' ').toLowerCase()}\n${title
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()}`

const resolveIntentFocusId = (
  runtime: RuntimeState,
  focusId?: string,
): FocusId => {
  const resolved = focusId?.trim() || resolveDefaultFocusId(runtime)
  ensureFocus(runtime, resolved)
  touchFocus(runtime, resolved)
  return resolved
}

export const applyCreateIntent = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = createIntentSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const duplicatedKey = normalizeIntentKey(
    parsed.data.prompt,
    parsed.data.title,
  )
  const all = [...runtime.idleIntents, ...runtime.idleIntentArchive]
  if (
    all.some(
      (intent) =>
        normalizeIntentKey(intent.prompt, intent.title) === duplicatedKey,
    )
  )
    return
  const timestamp = nowIso()
  const focusId = resolveIntentFocusId(runtime, parsed.data.focus_id)
  const triggerMode =
    parsed.data.trigger_mode ??
    (parsed.data.cooldown_ms !== undefined ? 'on_idle' : 'one_shot')
  const intent: IdleIntent = {
    id: `intent-${newId()}`,
    prompt: parsed.data.prompt,
    title: parsed.data.title,
    focusId,
    priority: parsed.data.priority ?? 'normal',
    status: 'pending',
    source: parsed.data.source ?? 'user_request',
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    maxAttempts: 2,
    triggerPolicy: {
      mode: triggerMode,
      cooldownMs: triggerMode === 'on_idle' ? (parsed.data.cooldown_ms ?? 0) : 0,
    },
    triggerState: {
      totalTriggered: 0,
    },
  }
  runtime.idleIntents.push(intent)
  await persistRuntimeState(runtime)
  await appendIntentSystemMessage(runtime, 'intent_created', intent)
}

export const applyUpdateIntent = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = updateIntentSchema.safeParse(item.attrs)
  if (!parsed.success) return
  const index = runtime.idleIntents.findIndex(
    (intent) => intent.id === parsed.data.id,
  )
  if (index < 0) return
  const current = runtime.idleIntents[index]
  if (!current || current.status === 'done') return
  const timestamp = nowIso()
  const nextFocusId =
    parsed.data.focus_id !== undefined
      ? resolveIntentFocusId(runtime, parsed.data.focus_id)
      : current.focusId
  const nextTriggerPolicy = {
    ...current.triggerPolicy,
  }
  if (parsed.data.trigger_mode !== undefined) {
    nextTriggerPolicy.mode = parsed.data.trigger_mode
    if (parsed.data.trigger_mode === 'one_shot') nextTriggerPolicy.cooldownMs = 0
  }
  if (parsed.data.cooldown_ms !== undefined) {
    nextTriggerPolicy.mode = 'on_idle'
    nextTriggerPolicy.cooldownMs = parsed.data.cooldown_ms
  }
  const next: IdleIntent = {
    ...current,
    ...(parsed.data.prompt !== undefined ? { prompt: parsed.data.prompt } : {}),
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.priority !== undefined
      ? { priority: parsed.data.priority }
      : {}),
    ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
    ...(parsed.data.last_task_id !== undefined
      ? { lastTaskId: parsed.data.last_task_id }
      : {}),
    triggerPolicy: nextTriggerPolicy,
    focusId: nextFocusId,
    updatedAt: timestamp,
  }
  if (next.status === 'done') {
    next.archivedAt = timestamp
    runtime.idleIntents.splice(index, 1)
    runtime.idleIntentArchive.push(next)
  } else runtime.idleIntents[index] = next
  await persistRuntimeState(runtime)
  await appendIntentSystemMessage(runtime, 'intent_updated', next)
}

export const applyDeleteIntent = async (
  runtime: RuntimeState,
  item: Parsed,
): Promise<void> => {
  const parsed = deleteIntentSchema.safeParse(item.attrs)
  if (!parsed.success) return
  if (
    runtime.idleIntentArchive.some(
      (intent) => intent.id === parsed.data.id && intent.status === 'done',
    )
  )
    return
  const index = runtime.idleIntents.findIndex(
    (intent) => intent.id === parsed.data.id && intent.status !== 'done',
  )
  if (index < 0) return
  const [removed] = runtime.idleIntents.splice(index, 1)
  if (!removed) return
  await persistRuntimeState(runtime)
  await appendIntentSystemMessage(runtime, 'intent_deleted', removed)
}
