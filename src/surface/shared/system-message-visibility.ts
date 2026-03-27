import { resolveSystemEvent, type SystemEventName } from './system-event.js'

import type { MessageVisibility } from '../../foundation/types/index.js'

type UserFacingSystemEventClass = 'user_value' | 'internal' | 'unknown'

const USER_VALUE_EVENTS = new Set<SystemEventName>([
  'startup',
  'task_created',
  'task_paused',
  'task_resumed',
  'task_canceled',
  'task_completed',
  'manager_fallback_reply',
])

const INTERNAL_EVENTS = new Set<SystemEventName>([
  'manager_round_limit',
  'manager_error',
  'trigger_fire',
  'worker_slot_freed',
  'plan_created',
  'plan_updated',
  'plan_deleted',
])

const classifySystemEventForUser = (
  eventName?: string,
): UserFacingSystemEventClass => {
  if (!eventName) return 'unknown'
  if (USER_VALUE_EVENTS.has(eventName as SystemEventName)) return 'user_value'
  if (INTERNAL_EVENTS.has(eventName as SystemEventName)) return 'internal'
  return 'unknown'
}

export const isSystemMessageVisibleToUser = (params: {
  visibility: MessageVisibility
  text?: string
  systemEventName?: string
  systemEventPayload?: Record<string, unknown>
}): boolean => {
  if (params.visibility === 'agent') return false
  const parsed = resolveSystemEvent({
    text: params.text ?? '',
    ...(params.systemEventName
      ? { systemEventName: params.systemEventName }
      : {}),
    ...(params.systemEventPayload
      ? { systemEventPayload: params.systemEventPayload }
      : {}),
  })
  const eventClass = classifySystemEventForUser(parsed.name)
  if (eventClass === 'user_value') return true
  if (eventClass === 'internal') return false
  return params.visibility === 'user'
}
