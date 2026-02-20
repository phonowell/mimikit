import { isVisibleToUser } from '../../shared/message-visibility.js'

import type { HistoryMessage, UserInput } from '../../types/index.js'

export type ChatMessage = HistoryMessage

export type ChatMessagesMode = 'full' | 'delta' | 'reset'

const toInflightChatMessage = (input: UserInput): ChatMessage => {
  if (input.role === 'system') {
    return {
      id: input.id,
      role: input.role,
      visibility: input.visibility,
      text: input.text,
      createdAt: input.createdAt,
      ...(input.quote ? { quote: input.quote } : {}),
    }
  }
  return {
    id: input.id,
    role: input.role,
    text: input.text,
    createdAt: input.createdAt,
    ...(input.quote ? { quote: input.quote } : {}),
  }
}

const tailWithLimit = (
  messages: ChatMessage[],
  limit: number,
): ChatMessage[] => {
  if (limit <= 0) return []
  return messages.slice(Math.max(0, messages.length - limit))
}

const withTailAndMode = (
  messages: ChatMessage[],
  limit: number,
  mode: ChatMessagesMode,
): { messages: ChatMessage[]; mode: ChatMessagesMode } => ({
  messages: tailWithLimit(messages, limit),
  mode,
})

const mergeChatMessagesWithoutLimit = (params: {
  history: HistoryMessage[]
  inflightInputs: UserInput[]
}): ChatMessage[] => {
  const merged: ChatMessage[] = params.history.filter((message) =>
    isVisibleToUser(message),
  )
  const seenIds = new Set(merged.map((message) => message.id))
  for (const input of params.inflightInputs) {
    if (!isVisibleToUser(input)) continue
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
  if (!afterId) return withTailAndMode(merged, params.limit, 'full')
  const afterIndex = merged.findIndex((item) => item.id === afterId)
  if (afterIndex < 0) return withTailAndMode(merged, params.limit, 'reset')
  return {
    messages: merged.slice(afterIndex + 1),
    mode: 'delta',
  }
}
