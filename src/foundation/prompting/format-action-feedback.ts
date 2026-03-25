import { escapeCdata, stringifyPromptJson } from './format-base.js'

import type { ManagerActionFeedback } from '../types/index.js'

export const buildActionFeedbackPromptPayload = (
  feedback: ManagerActionFeedback[],
): { items: Array<Record<string, unknown>> } | undefined => {
  if (feedback.length === 0) return undefined
  const entries = feedback
    .map((item) => {
      const action = item.action.trim()
      const error = item.error.trim()
      const hint = item.hint.trim()
      if (!action || !error || !hint) return null
      const attempted = item.attempted?.trim()
      return {
        action,
        error,
        hint,
        ...(attempted ? { attempted } : {}),
        ...(item.code ? { code: item.code } : {}),
        ...(item.repair ? { repair: item.repair } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  return entries.length === 0 ? undefined : { items: entries }
}

export const formatActionFeedback = (
  feedback: ManagerActionFeedback[],
): string => {
  const payload = buildActionFeedbackPromptPayload(feedback)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}
