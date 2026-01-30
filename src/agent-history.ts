import type { ChatMessage, TaskResult, UserInput } from './protocol.js'

export const filterChatHistory = (
  history: ChatMessage[],
  inputs: UserInput[],
): ChatMessage[] => {
  const inputIds = new Set(inputs.map((i) => i.id))
  const inputSet = new Set(inputs.map((i) => `${i.createdAt}|${i.text}`))
  const deduped = history.filter((msg) => {
    if (msg.role !== 'user') return true
    if (inputIds.has(msg.id)) return false
    return !inputSet.has(`${msg.createdAt}|${msg.text}`)
  })
  return deduped
}

export const sortTaskResults = (results: TaskResult[]): TaskResult[] =>
  results.slice().sort((a, b) => {
    const ta = Date.parse(a.completedAt) || 0
    const tb = Date.parse(b.completedAt) || 0
    return ta - tb
  })
