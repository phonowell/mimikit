import { isVisibleToAgent } from '../../surface/shared/message-visibility.js'

import { formatMessagesJson } from './format-message-json.js'
import { resolveQuoteReference } from './format-message-quote.js'

import type {
  PromptQuoteReference,
  PromptQuoteReferenceLookup,
} from './format-message-quote.js'
import type { HistoryMessage, UserInput } from '../types/index.js'

type InputPromptMessage = {
  id: string
  role: string
  time: string
  focus_id: string
  source?: string
  platform?: string
  quote?: string
  quote_ref?: PromptQuoteReference
  content: string
}

type HistoryPromptMessage = {
  id: string
  role: string
  time: string
  focus_id: string
  quote?: string
  quote_ref?: PromptQuoteReference
  content: string
}

export const buildInputsPromptPayload = (
  inputs: UserInput[],
  quoteLookup?: PromptQuoteReferenceLookup,
): { messages: InputPromptMessage[] } | undefined => {
  if (inputs.length === 0) return undefined
  const entries = inputs
    .map((input) => {
      if (!isVisibleToAgent(input)) return null
      const content = input.text.trim()
      if (!content) return null
      const quote = resolveQuoteReference(input.quote, quoteLookup)
      return {
        id: input.id,
        role: input.role,
        time: input.createdAt,
        focus_id: input.focusId,
        ...(input.role === 'user' && input.source
          ? { source: input.source }
          : {}),
        ...(input.role === 'user' && input.platform
          ? { platform: input.platform }
          : {}),
        ...quote,
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return entries.length === 0 ? undefined : { messages: entries }
}

export const formatInputs = (
  inputs: UserInput[],
  quoteLookup?: PromptQuoteReferenceLookup,
): string => {
  const payload = buildInputsPromptPayload(inputs, quoteLookup)
  if (!payload) return ''
  return formatMessagesJson(payload.messages)
}

export const buildRecentHistoryPromptPayload = (
  history: HistoryMessage[],
  quoteLookup?: PromptQuoteReferenceLookup,
): { messages: HistoryPromptMessage[] } | undefined => {
  if (history.length === 0) return undefined
  const entries = history
    .map((item) => {
      const content = item.text.trim()
      if (!content) return null
      const quote = resolveQuoteReference(item.quote, quoteLookup)
      return {
        id: item.id,
        role: item.role,
        time: item.createdAt,
        focus_id: item.focusId,
        ...quote,
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  return entries.length === 0 ? undefined : { messages: entries }
}

export const formatRecentHistory = (
  history: HistoryMessage[],
  quoteLookup?: PromptQuoteReferenceLookup,
): string => {
  const payload = buildRecentHistoryPromptPayload(history, quoteLookup)
  if (!payload) return ''
  return formatMessagesJson(payload.messages)
}
