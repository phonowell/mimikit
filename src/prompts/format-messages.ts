import {
  escapeCdata,
  mapHistoryRole,
  parseIsoToMs,
  stringifyPromptYaml,
} from './format-base.js'

import type { HistoryMessage, UserInput } from '../types/index.js'

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

const NEAR_WINDOW_COUNT = 30
const FAR_ZONE_MAX_CHARS = 120

/** Near zone keeps full text; far zone truncates to save byte budget */
export const formatHistory = (history: HistoryMessage[]): string => {
  if (history.length === 0) return ''
  const nearStart = Math.max(0, history.length - NEAR_WINDOW_COUNT)
  const entries = history
    .map((item, index) => {
      let content = item.text.trim()
      if (!content) return null
      if (index < nearStart && content.length > FAR_ZONE_MAX_CHARS)
        content = `${content.slice(0, FAR_ZONE_MAX_CHARS)}…`
      return {
        id: item.id,
        role: mapHistoryRole(item.role),
        time: item.createdAt,
        ...(item.quote ? { quote: item.quote } : {}),
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return formatMessagesYaml(entries)
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
