import { isAbsolute, relative, resolve } from 'node:path'

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
  ReadFileLookupMessage,
  TaskArchiveLookupMessage,
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

const formatMessagesJson = (
  entries: Array<{
    id: string
    role: string
    time: string
    focus_id: string
    source?: string
    platform?: string
    quote?: string
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

export const formatInputs = (inputs: UserInput[]): string => {
  if (inputs.length === 0) return ''
  const entries = inputs
    .map((input) => {
      if (!isVisibleToAgent(input)) return null
      const content = input.text.trim()
      if (!content) return null
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
        ...(input.quote ? { quote: input.quote } : {}),
        content,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return formatMessagesJson(entries)
}

export const formatRecentHistory = (history: HistoryMessage[]): string => {
  if (history.length === 0) return ''
  const entries = history
    .map((item) => {
      const content = item.text.trim()
      if (!content) return null
      return {
        id: item.id,
        role: item.role,
        time: item.createdAt,
        focus_id: item.focusId,
        ...(item.quote ? { quote: item.quote } : {}),
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

const toDisplayPath = (path: string, workDir?: string): string => {
  const trimmedPath = path.trim()
  if (!workDir) return trimmedPath
  const trimmedWorkDir = workDir.trim()
  if (!trimmedWorkDir) return trimmedPath
  const resolvedWorkDir = resolve(trimmedWorkDir)
  const resolvedPath = isAbsolute(trimmedPath)
    ? resolve(trimmedPath)
    : resolve(resolvedWorkDir, trimmedPath)
  const rel = relative(resolvedWorkDir, resolvedPath)
  if (!rel) return '.'
  if (rel.startsWith('..') || isAbsolute(rel)) return trimmedPath
  return rel
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

export const formatTaskArchiveLookup = (
  lookup: TaskArchiveLookupMessage[],
  workDir?: string,
): string => {
  if (lookup.length === 0) return ''
  const entries = lookup
    .map((item) => {
      const archivePath = toDisplayPath(item.archivePath, workDir)
      if (!archivePath) return null
      return {
        task_id: item.taskId,
        status: item.status,
        completed_at: item.completedAt,
        archive_path: archivePath,
        score: item.score,
        ...(item.title ? { title: item.title.trim() } : {}),
        ...(item.snippet ? { snippet: item.snippet } : {}),
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
