import type { HistoryMessage, UserInput } from '../types/index.js'

export type ChatMessage = HistoryMessage

export type ChatMessagesMode = 'full' | 'delta' | 'reset'

const toInflightChatMessage = (input: UserInput): ChatMessage => ({
  id: input.id,
  role: 'user',
  text: input.text,
  createdAt: input.createdAt,
  ...(input.quote ? { quote: input.quote } : {}),
})

const tailWithLimit = (
  messages: ChatMessage[],
  limit: number,
): ChatMessage[] => {
  if (limit <= 0) return []
  return messages.slice(Math.max(0, messages.length - limit))
}

const mergeChatMessagesWithoutLimit = (params: {
  history: HistoryMessage[]
  inflightInputs: UserInput[]
}): ChatMessage[] => {
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
  return merged
}

export const mergeChatMessages = (params: {
  history: HistoryMessage[]
  inflightInputs: UserInput[]
  limit: number
}): ChatMessage[] => {
  const merged = mergeChatMessagesWithoutLimit(params)
  return tailWithLimit(merged, params.limit)
}

export const selectChatMessages = (params: {
  history: HistoryMessage[]
  inflightInputs: UserInput[]
  limit: number
  afterId?: string
}): { messages: ChatMessage[]; mode: ChatMessagesMode } => {
  const merged = mergeChatMessagesWithoutLimit(params)
  const afterId = params.afterId?.trim()
  if (!afterId) {
    return {
      messages: tailWithLimit(merged, params.limit),
      mode: 'full',
    }
  }
  const afterIndex = merged.findIndex((item) => item.id === afterId)
  if (afterIndex < 0) {
    return {
      messages: tailWithLimit(merged, params.limit),
      mode: 'reset',
    }
  }
  return {
    messages: merged.slice(afterIndex + 1),
    mode: 'delta',
  }
}
