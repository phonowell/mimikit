import { safe } from '../log/safe.js'
import { formatSystemEventText } from '../shared/system-event.js'
import { newId, nowIso } from '../shared/utils.js'

import { appendHistory } from './store.js'

import type { FocusId, HistoryMessage } from '../types/index.js'

export type MemoryRememberedEventPayload = {
  entryId: string
  ref: string
  category: string
  dedupeKey: string
  operation: 'created' | 'merged' | 'overwritten' | 'appended' | 'noop'
  merged: boolean
  replaced: boolean
  truncated: boolean
  contentChars: number
  source: 'explicit_user_request' | 'repeated_user_signal' | 'agent_inference'
}

const buildSummary = (payload: MemoryRememberedEventPayload): string =>
  `Memory entry ${payload.entryId} ${payload.operation}.`

export const appendMemoryRememberedSystemMessage = (
  historyPath: string,
  focusId: FocusId,
  payload: MemoryRememberedEventPayload,
): Promise<boolean> => {
  const text = formatSystemEventText({
    summary: buildSummary(payload),
    event: 'memory_remembered',
    payload: {
      entry_id: payload.entryId,
      ref: payload.ref,
      category: payload.category,
      dedupe_key: payload.dedupeKey,
      operation: payload.operation,
      merged: payload.merged,
      replaced: payload.replaced,
      truncated: payload.truncated,
      content_chars: payload.contentChars,
      source: payload.source,
    },
  })
  const message: HistoryMessage = {
    id: `sys-memory-${newId()}`,
    role: 'system',
    visibility: 'agent',
    text,
    createdAt: nowIso(),
    focusId,
  }
  return safe(
    'appendHistory: memory_remembered_system_message',
    async () => {
      await appendHistory(historyPath, message)
      return true
    },
    { fallback: false, meta: { focusId, entryId: payload.entryId } },
  )
}
