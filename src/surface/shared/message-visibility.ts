import { isSystemMessageVisibleToUser } from './system-message-visibility.js'

import type { MessageVisibility, Role } from '../../foundation/types/index.js'

type VisibilityScopedMessage =
  | {
      role: 'system'
      visibility: MessageVisibility
      text?: string
      systemEventName?: string
      systemEventPayload?: Record<string, unknown>
    }
  | {
      role: Exclude<Role, 'system'>
    }

const resolveVisibility = (
  value: VisibilityScopedMessage,
): MessageVisibility => {
  if (value.role !== 'system') return 'all'
  return value.visibility
}

export const isVisibleToUser = (value: VisibilityScopedMessage): boolean => {
  if (value.role !== 'system') return true
  return isSystemMessageVisibleToUser({
    visibility: value.visibility,
    ...(typeof value.text === 'string' ? { text: value.text } : {}),
    ...(value.systemEventName
      ? { systemEventName: value.systemEventName }
      : {}),
    ...(value.systemEventPayload
      ? { systemEventPayload: value.systemEventPayload }
      : {}),
  })
}

export const isVisibleToAgent = (value: VisibilityScopedMessage): boolean => {
  const visibility = resolveVisibility(value)
  return visibility === 'agent' || visibility === 'all'
}
