import { isVisibleToAgent } from '../shared/message-visibility.js'

import {
  escapeCdata,
  parseIsoToMs,
  stringifyPromptJson,
} from './format-base.js'

import type {
  HistoryLookupMessage,
  HistoryMessage,
  ManagerActionFeedback,
  QueryLookupMessage,
  ReadFileLookupMessage,
  UserInput,
} from '../types/index.js'

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

const sortByTimeAndIdDesc = <T extends { time: string; id: string }>(
  entries: T[],
): T[] =>
  [...entries].sort((a, b) => {
    const aTs = parseIsoToMs(a.time)
    const bTs = parseIsoToMs(b.time)
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })

const formatMessagesJson = (
  entries: Array<{
    id: string
    role: string
    time: string
    focus_id: string
    source?: string
    platform?: string
    quote?: string
    quote_ref?: PromptQuoteReference
    content: string
  }>,
): string => {
  if (entries.length === 0) return ''
  const sorted = sortByTimeAndIdDesc(entries)
  return escapeCdata(
    stringifyPromptJson({
      messages: sorted,
    }),
  )
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

const resolveQuoteReference = (
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

export const formatInputs = (
  inputs: UserInput[],
  quoteLookup?: PromptQuoteReferenceLookup,
): string => {
  if (inputs.length === 0) return ''
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
  return formatMessagesJson(entries)
}

export const formatRecentHistory = (
  history: HistoryMessage[],
  quoteLookup?: PromptQuoteReferenceLookup,
): string => {
  if (history.length === 0) return ''
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
  return formatMessagesJson(entries)
}

const mapLookupRole = (role: HistoryLookupMessage['role']): string => {
  if (role === 'agent') return 'agent'
  return role
}

export const formatHistoryLookup = (lookup: HistoryLookupMessage[]): string => {
  if (lookup.length === 0) return ''
  const entries = lookup
    .map((item) => {
      const content = item.content.trim()
      if (!content) return null
      return {
        id: item.id,
        role: mapLookupRole(item.role),
        time: item.time,
        score: item.score,
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  if (entries.length === 0) return ''
  const sorted = sortByTimeAndIdDesc(entries)
  return escapeCdata(
    stringifyPromptJson({
      messages: sorted,
    }),
  )
}

export const formatReadFileLookup = (
  lookup: ReadFileLookupMessage[],
): string => {
  if (lookup.length === 0) return ''
  const entries = lookup
    .map((item) => {
      const path = item.path.trim()
      if (!path) return null
      return {
        path,
        status: item.status,
        encoding: item.encoding,
        ...(item.chars !== undefined ? { chars: item.chars } : {}),
        ...(item.fromLine !== undefined ? { from_line: item.fromLine } : {}),
        ...(item.lineCount !== undefined ? { line_count: item.lineCount } : {}),
        ...(item.totalLines !== undefined
          ? { total_lines: item.totalLines }
          : {}),
        ...(item.truncated !== undefined ? { truncated: item.truncated } : {}),
        ...(item.error ? { error: item.error.trim() } : {}),
        ...(item.content !== undefined ? { content: item.content } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  if (entries.length === 0) return ''
  return escapeCdata(
    stringifyPromptJson({
      files: entries,
    }),
  )
}

export const formatActionFeedback = (
  feedback: ManagerActionFeedback[],
): string => {
  if (feedback.length === 0) return ''
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
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
  if (entries.length === 0) return ''
  return escapeCdata(
    stringifyPromptJson({
      items: entries,
    }),
  )
}

export const formatQueryLookup = (lookup?: QueryLookupMessage): string => {
  if (!lookup) return ''
  return stringifyPromptJson(lookup)
}
