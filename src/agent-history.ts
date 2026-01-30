import {
  HISTORY_FALLBACK_MESSAGES,
  MAX_HISTORY_KEYWORDS,
  MAX_HISTORY_MESSAGES,
} from './agent-constants.js'
import { isLatinToken } from './agent-keywords.js'

import type { ChatMessage, TaskResult, UserInput } from './protocol.js'

export const filterChatHistory = (
  history: ChatMessage[],
  inputs: UserInput[],
  keywords: string[],
): ChatMessage[] => {
  const inputIds = new Set(inputs.map((i) => i.id))
  const inputSet = new Set(inputs.map((i) => `${i.createdAt}|${i.text}`))
  const deduped = history.filter((msg) => {
    if (msg.role !== 'user') return true
    if (inputIds.has(msg.id)) return false
    return !inputSet.has(`${msg.createdAt}|${msg.text}`)
  })
  if (deduped.length === 0) return []
  const historyKeywords = keywords
    .filter((keyword) => !isLatinToken(keyword) || keyword.length >= 3)
    .slice(0, MAX_HISTORY_KEYWORDS)
  if (historyKeywords.length === 0)
    return deduped.slice(-HISTORY_FALLBACK_MESSAGES)
  const filtered = deduped.filter((msg) => {
    const lower = msg.text.toLowerCase()
    return historyKeywords.some((keyword) => {
      if (isLatinToken(keyword)) return lower.includes(keyword)
      return msg.text.includes(keyword)
    })
  })
  if (filtered.length === 0) return deduped.slice(-HISTORY_FALLBACK_MESSAGES)
  return filtered.slice(-MAX_HISTORY_MESSAGES)
}

export const sortTaskResults = (results: TaskResult[]): TaskResult[] =>
  results.slice().sort((a, b) => {
    const ta = Date.parse(a.completedAt) || 0
    const tb = Date.parse(b.completedAt) || 0
    return ta - tb
  })
