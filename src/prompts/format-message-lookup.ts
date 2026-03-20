import { escapeCdata, stringifyPromptJson } from './format-base.js'
import { sortByTimeAndIdDesc } from './format-message-json.js'

import type {
  HistoryLookupMessage,
  QueryLookupMessage,
  ReadFileLookupMessage,
} from '../types/index.js'

const mapLookupRole = (role: HistoryLookupMessage['role']): string => {
  if (role === 'agent') return 'agent'
  return role
}

export const buildHistoryLookupPromptPayload = (
  lookup: HistoryLookupMessage[],
):
  | {
      messages: Array<{
        id: string
        role: string
        time: string
        score: number
        content: string
      }>
    }
  | undefined => {
  if (lookup.length === 0) return undefined
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
  if (entries.length === 0) return undefined
  return { messages: sortByTimeAndIdDesc(entries) }
}

export const formatHistoryLookup = (lookup: HistoryLookupMessage[]): string => {
  const payload = buildHistoryLookupPromptPayload(lookup)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}

export const buildReadFileLookupPromptPayload = (
  lookup: ReadFileLookupMessage[],
): { files: Array<Record<string, unknown>> } | undefined => {
  if (lookup.length === 0) return undefined
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
  return entries.length === 0 ? undefined : { files: entries }
}

export const formatReadFileLookup = (
  lookup: ReadFileLookupMessage[],
): string => {
  const payload = buildReadFileLookupPromptPayload(lookup)
  if (!payload) return ''
  return escapeCdata(stringifyPromptJson(payload))
}

export const formatQueryLookup = (lookup?: QueryLookupMessage): string => {
  if (!lookup) return ''
  return stringifyPromptJson(lookup)
}
