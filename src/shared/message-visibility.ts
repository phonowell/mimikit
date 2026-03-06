import type { MessageVisibility, Role } from '../types/index.js'

import { isSystemMessageVisibleToUser } from './system-message-visibility.js'

type VisibilityScopedMessage =
  | {
      role: 'system'
      visibility: MessageVisibility
      text?: string
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
  })
}

export const isVisibleToAgent = (value: VisibilityScopedMessage): boolean => {
  const visibility = resolveVisibility(value)
  return visibility === 'agent' || visibility === 'all'
}
