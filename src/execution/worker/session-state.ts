import { readProviderErrorCode } from '../providers/provider-error.js'

import type { Task } from '../../foundation/types/index.js'

const SESSION_RESET_PATTERNS = [
  /thread.+(not found|does not exist|invalid|expired|deleted)/i,
  /session.+(not found|does not exist|invalid|expired|deleted)/i,
  /resume.+(not found|invalid|expired|failed)/i,
  /stream disconnected/i,
  /reconnecting\.\.\./i,
]

export const normalizeSessionId = (
  value: string | null | undefined,
): string | undefined => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export const selectReusableSessionId = (task: Task): string | undefined => {
  const current = normalizeSessionId(task.sessionId)
  if (!current) return undefined
  if (task.sessionState === 'discarded') return undefined
  if (task.cancel?.source === 'user') return undefined
  return current
}

export const shouldResetSessionAfterError = (error: unknown): boolean => {
  const code = readProviderErrorCode(error)
  if (code === 'provider_aborted' || code === 'provider_timeout') return false
  const message = error instanceof Error ? error.message : String(error)
  if (!message) return false
  return SESSION_RESET_PATTERNS.some((pattern) => pattern.test(message))
}
