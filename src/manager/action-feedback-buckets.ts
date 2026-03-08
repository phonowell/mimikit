import { truncateText } from '../shared/text.js'

import type { ManagerActionFeedback } from '../types/index.js'

const MAX_HINT_BUCKET_CHARS = 280

const normalizeHintForBucket = (hint: string): string => {
  const normalized = hint.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return truncateText(normalized, MAX_HINT_BUCKET_CHARS, {
    normalizeWhitespace: true,
  })
}

export const collectActionFeedbackHints = (
  feedback: ManagerActionFeedback[],
): string[] =>
  feedback
    .map((item) => normalizeHintForBucket(item.hint))
    .filter((item): item is string => item.length > 0)

export const collectActionFeedbackHintBuckets = (
  feedback: ManagerActionFeedback[],
): string[] =>
  feedback
    .map((item) => {
      const action = item.action.trim()
      const error = item.error.trim()
      const hint = normalizeHintForBucket(item.hint)
      if (!action || !error || !hint) return null
      return `${action}::${error}::${hint}`
    })
    .filter((item): item is string => item !== null)
