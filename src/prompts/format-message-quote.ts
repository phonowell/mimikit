import { isVisibleToAgent } from '../shared/message-visibility.js'

import type { HistoryMessage, UserInput } from '../types/index.js'

const QUOTE_REF_MAX_LENGTH = 180

export type PromptQuoteReference = {
  id: string
  role: string
  time: string
  focus_id: string
  content: string
}

export type PromptQuoteReferenceLookup = Map<string, PromptQuoteReference>

type QuoteReferenceSource = {
  id: string
  role: string
  createdAt: string
  focusId: string
  text: string
}

const normalizeQuoteId = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const normalizeQuoteContent = (
  text: string,
  maxLength = QUOTE_REF_MAX_LENGTH,
): string => {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength).trimEnd()}...`
}

const toPromptQuoteReference = (
  source: QuoteReferenceSource,
): PromptQuoteReference | null => {
  const id = source.id.trim()
  const role = source.role.trim()
  const time = source.createdAt.trim()
  const focusId = source.focusId.trim()
  const content = normalizeQuoteContent(source.text)
  if (!id || !role || !time || !focusId || !content) return null
  return {
    id,
    role,
    time,
    focus_id: focusId,
    content,
  }
}

const toVisibleQuoteReference = (
  source: HistoryMessage | UserInput,
): PromptQuoteReference | null => {
  if (!isVisibleToAgent(source)) return null
  return toPromptQuoteReference(source)
}

export const resolveQuoteReference = (
  quoteId: string | undefined,
  quoteLookup?: PromptQuoteReferenceLookup,
): { quote?: string; quote_ref?: PromptQuoteReference } => {
  const normalizedQuoteId = normalizeQuoteId(quoteId)
  if (!normalizedQuoteId) return {}
  const quoteRef = quoteLookup?.get(normalizedQuoteId)
  if (!quoteRef) return { quote: normalizedQuoteId }
  return {
    quote: normalizedQuoteId,
    quote_ref: quoteRef,
  }
}

export const buildQuoteReferenceLookup = (params: {
  history: HistoryMessage[]
  inputs: UserInput[]
}): PromptQuoteReferenceLookup => {
  const lookup: PromptQuoteReferenceLookup = new Map()
  for (const item of params.history) {
    const ref = toVisibleQuoteReference(item)
    if (!ref) continue
    lookup.set(ref.id, ref)
  }
  for (const item of params.inputs) {
    const ref = toVisibleQuoteReference(item)
    if (!ref) continue
    lookup.set(ref.id, ref)
  }
  return lookup
}
