import { truncateText } from '../../../foundation/shared/text.js'
import { type HistoryMessage } from '../../../foundation/types/index.js'
import { readHistory } from '../../../persistence/history/store.js'
import { readMemoryMarkdown } from '../../../work/memory/store.js'
import { type MemoryScoreContext } from '../entry-score.js'

import type { MemoryRefreshPayload } from './types.js'
import type { ManagerRuntime } from '../../../kernel/orchestrator/runtime-interfaces.js'

const MAX_SIGNALS = 80
const MAX_TEXT = 800
const MAX_SCORE_QUERY_CHARS = 4_000
const MAX_SCORE_MENTION_ITEMS = 96
const MEMORY_SIGNAL_EVENTS = new Set(['memory_remembered'])

const toMemoryRefreshSignalText = (item: HistoryMessage): string => {
  if (item.role !== 'system') return truncateText(item.text, MAX_TEXT)
  const entryId = item.systemEventPayload?.entry_id
  const category = item.systemEventPayload?.category
  const ref = item.systemEventPayload?.ref
  const operation = item.systemEventPayload?.operation
  const parts = [
    typeof entryId === 'string' ? `entry_id=${entryId}` : undefined,
    typeof category === 'string' ? `category=${category}` : undefined,
    typeof ref === 'string' ? `ref=${ref}` : undefined,
    typeof operation === 'string' ? `operation=${operation}` : undefined,
  ].filter((value): value is string => Boolean(value))
  if (parts.length > 0) return parts.join('\n')
  return truncateText(item.text, MAX_TEXT)
}

const isMemoryRefreshSignal = (item: HistoryMessage): boolean => {
  if (item.role !== 'system') return false
  const eventName = item.systemEventName?.trim()
  if (!eventName) return false
  return MEMORY_SIGNAL_EVENTS.has(eventName)
}

const pushMention = (target: string[], value: string | undefined): void => {
  const normalized = value?.trim()
  if (!normalized) return
  target.push(normalized)
}

export const buildMemoryRefreshPayload = async (
  runtime: ManagerRuntime,
): Promise<MemoryRefreshPayload> => {
  const history = await readHistory(runtime.paths.history)
  const visible = history
    .filter((item) => isMemoryRefreshSignal(item))
    .slice(-MAX_SIGNALS)
  const memoryMarkdown = await readMemoryMarkdown(runtime.paths.memoryFile)
  return {
    workDir: runtime.config.workDir,
    model: runtime.config.manager.model,
    ...(runtime.config.manager.baseUrl
      ? { baseUrl: runtime.config.manager.baseUrl }
      : {}),
    ...(runtime.config.manager.apiKey
      ? { apiKey: runtime.config.manager.apiKey }
      : {}),
    ...(runtime.config.manager.proxy
      ? { proxy: runtime.config.manager.proxy }
      : {}),
    modelReasoningEffort: runtime.config.manager.modelReasoningEffort,
    memoryMarkdown,
    signals: visible.map((item) => ({
      id: item.id,
      role: item.role,
      createdAt: item.createdAt,
      text: truncateText(toMemoryRefreshSignalText(item), MAX_TEXT),
    })),
  }
}

export const buildRefreshScoreContext = (
  runtime: ManagerRuntime,
  payload: MemoryRefreshPayload,
): MemoryScoreContext => {
  const mentions: string[] = []
  for (const event of payload.signals) pushMention(mentions, event.text)

  const uniqueForQuery: string[] = []
  const querySeen = new Set<string>()
  for (const item of mentions) {
    const key = item.trim().toLowerCase()
    if (!key || querySeen.has(key)) continue
    querySeen.add(key)
    uniqueForQuery.push(item)
  }
  const queryText = uniqueForQuery
    .slice(0, MAX_SCORE_MENTION_ITEMS)
    .join('\n')
    .slice(0, MAX_SCORE_QUERY_CHARS)

  const workingFocusIds = [
    ...new Set(
      runtime.tasks
        .filter(
          (task) =>
            task.status === 'pending' ||
            task.status === 'running' ||
            task.status === 'paused',
        )
        .map((task) => task.focusId),
    ),
  ]
  return {
    queryText,
    mentionTexts: mentions.slice(0, MAX_SCORE_MENTION_ITEMS),
    workingFocusIds,
  }
}
