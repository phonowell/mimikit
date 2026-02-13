import { appendJsonl, readJsonl, writeJsonl } from '../../storage/jsonl.js'

import type { HistoryMessage } from '../../types/index.js'

export type CompactedSummary = {
  id: string
  createdAt: string
  messageCount: number
  timeRange: { from: string; to: string }
  roles: Record<string, number>
  taskIds: string[]
  topics: string[]
}

const TASK_ID_RE = /task-[a-zA-Z0-9_-]+/g
const MAX_COMPACTED_ENTRIES = 10

const extractTaskIds = (messages: HistoryMessage[]): string[] => {
  const ids = new Set<string>()
  for (const msg of messages) {
    const matches = msg.text.matchAll(TASK_ID_RE)
    for (const match of matches) ids.add(match[0])
  }
  return [...ids]
}

const extractTopics = (messages: HistoryMessage[]): string[] => {
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text.trim())
  if (userMessages.length === 0) return []
  return userMessages
    .slice(0, 5)
    .map((text) => text.slice(0, 80))
    .filter(Boolean)
}

const countRoles = (messages: HistoryMessage[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const msg of messages) counts[msg.role] = (counts[msg.role] ?? 0) + 1
  return counts
}

export const buildCompactedSummary = (
  truncated: HistoryMessage[],
): CompactedSummary | undefined => {
  if (truncated.length === 0) return undefined
  const sorted = [...truncated].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  )
  const from = sorted[0]?.createdAt ?? ''
  const to = sorted[sorted.length - 1]?.createdAt ?? ''
  return {
    id: `compacted-${Date.now()}`,
    createdAt: new Date().toISOString(),
    messageCount: truncated.length,
    timeRange: { from, to },
    roles: countRoles(truncated),
    taskIds: extractTaskIds(truncated),
    topics: extractTopics(truncated),
  }
}

export const appendCompactedSummary = async (
  path: string,
  summary: CompactedSummary,
): Promise<void> => {
  const existing = await readJsonl<CompactedSummary>(path, {
    ensureFile: true,
  })
  if (existing.length >= MAX_COMPACTED_ENTRIES) {
    const kept = existing.slice(existing.length - MAX_COMPACTED_ENTRIES + 1)
    await writeJsonl(path, [...kept, summary])
  } else {
    await appendJsonl(path, [summary])
  }
}

export const readCompactedSummaries = (
  path: string,
): Promise<CompactedSummary[]> =>
  readJsonl<CompactedSummary>(path, { ensureFile: true })

export const formatCompactedContext = (
  summaries: CompactedSummary[],
): string => {
  if (summaries.length === 0) return ''
  const lines: string[] = []
  for (const summary of summaries) {
    const parts: string[] = [
      `${summary.timeRange.from} ~ ${summary.timeRange.to}`,
      `${summary.messageCount} messages`,
    ]
    if (summary.taskIds.length > 0)
      parts.push(`tasks: ${summary.taskIds.join(', ')}`)
    if (summary.topics.length > 0)
      parts.push(`topics: ${summary.topics.join(' | ')}`)
    lines.push(`- ${parts.join('; ')}`)
  }
  return lines.join('\n')
}
