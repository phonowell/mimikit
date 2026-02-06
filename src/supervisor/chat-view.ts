import type { HistoryMessage, UserInput } from '../types/index.js'

export type ChatMessage = HistoryMessage

const toInflightChatMessage = (input: UserInput): ChatMessage => ({
  id: input.id,
  role: 'user',
  text: input.text,
  createdAt: input.createdAt,
  ...(input.quote ? { quote: input.quote } : {}),
})

export const mergeChatMessages = (params: {
  history: HistoryMessage[]
  inflightInputs: UserInput[]
  limit: number
}): ChatMessage[] => {
  if (params.limit <= 0) return []
  const merged: ChatMessage[] = []
  const seenIds = new Set<string>()
  for (const message of params.history) {
    merged.push(message)
    seenIds.add(message.id)
  }
  for (const input of params.inflightInputs) {
    if (seenIds.has(input.id)) continue
    merged.push(toInflightChatMessage(input))
    seenIds.add(input.id)
  }
  return merged.slice(Math.max(0, merged.length - params.limit))
}
