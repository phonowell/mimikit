import type { MessageVisibility, Role } from '../types/index.js'

type VisibilityScopedMessage =
  | {
      role: 'system'
      visibility: MessageVisibility
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
  const visibility = resolveVisibility(value)
  return visibility === 'user' || visibility === 'all'
}

export const isVisibleToAgent = (value: VisibilityScopedMessage): boolean => {
  const visibility = resolveVisibility(value)
  return visibility === 'agent' || visibility === 'all'
}
