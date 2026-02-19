import {
  escapeCdata,
  parseIsoToMs,
  stringifyPromptYaml,
} from './format-base.js'

import type {
  HistoryLookupMessage,
  ManagerActionFeedback,
  UserInput,
} from '../types/index.js'

const sortByTimeAndIdDesc = <T extends { time: string; id: string }>(
  entries: T[],
): T[] =>
  [...entries].sort((a, b) => {
    const aTs = parseIsoToMs(a.time)
    const bTs = parseIsoToMs(b.time)
    if (aTs !== bTs) return bTs - aTs
    return a.id.localeCompare(b.id)
  })

const formatMessagesYaml = (
  entries: Array<{
    id: string
    role: string
    time: string
    quote?: string
    content: string
  }>,
): string => {
  if (entries.length === 0) return ''
  const sorted = sortByTimeAndIdDesc(entries)
  return escapeCdata(
    stringifyPromptYaml({
      messages: sorted,
    }),
  )
}

export const formatInputs = (inputs: UserInput[]): string => {
  if (inputs.length === 0) return ''
  const entries = inputs
    .map((input) => {
      const content = input.text.trim()
      if (!content) return null
      return {
        id: input.id,
        role: 'user',
        time: input.createdAt,
        ...(input.quote ? { quote: input.quote } : {}),
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return formatMessagesYaml(entries)
}

const mapLookupRole = (role: HistoryLookupMessage['role']): string => {
  if (role === 'assistant') return 'agent'
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
    stringifyPromptYaml({
      messages: sorted,
    }),
  )
}

export const formatDecesionsYaml = (decesions: string[]): string => {
  if (decesions.length === 0) return ''
  const entries = decesions
    .map((decesion) => decesion.trim())
    .filter((decesion) => decesion.length > 0)
    .map((content) => ({ content }))
  if (entries.length === 0) return ''
  return escapeCdata(
    stringifyPromptYaml({
      decesions: entries,
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
    stringifyPromptYaml({
      items: entries,
    }),
  )
}
