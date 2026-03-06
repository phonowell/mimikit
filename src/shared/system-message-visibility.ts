import type { MessageVisibility } from '../types/index.js'

import { parseSystemEventText, type SystemEventName } from './system-event.js'

type UserFacingSystemEventClass = 'user_value' | 'internal' | 'unknown'

const USER_VALUE_EVENTS = new Set<SystemEventName>([
  'startup',
  'task_created',
  'task_canceled',
  'task_completed',
  'manager_fallback_reply',
  'user_choice',
  'user_choice_skipped',
  'session_summary_restored',
])

const INTERNAL_EVENTS = new Set<SystemEventName>([
  'manager_round_limit',
  'manager_error',
  'action_feedback',
  'trigger_fire',
  'idle',
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
}): boolean => {
  if (params.visibility === 'agent') return false
  const parsed =
    typeof params.text === 'string'
      ? parseSystemEventText(params.text)
      : { summary: '', name: undefined, payload: undefined }
  const eventClass = classifySystemEventForUser(parsed.name)
  if (eventClass === 'user_value') return true
  if (eventClass === 'internal') return false
  return params.visibility === 'user'
}
