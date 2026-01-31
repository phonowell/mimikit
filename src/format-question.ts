import type { PendingQuestion } from './types/history.js'

const formatOptions = (options?: string[]): string => {
  if (!options || options.length === 0) return ''
  const lines = options.map((opt, idx) => `${idx + 1}. ${opt}`)
  return `\nOptions:\n${lines.join('\n')}`
}

const formatDefault = (value?: string): string =>
  value ? `\nDefault: ${value}` : ''

export const formatPendingQuestion = (question: PendingQuestion): string =>
  `${question.question}${formatOptions(question.options)}${formatDefault(
    question.default,
  )}`.trim()
