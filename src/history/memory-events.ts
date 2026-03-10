import { safe } from '../log/safe.js'
import {
  createSystemEventRecord,
  type SystemEventRecord,
} from '../shared/system-event.js'
import { newId, nowIso } from '../shared/utils.js'

import { appendHistory } from './store.js'

import type { FocusId, HistoryMessage } from '../types/index.js'

export type MemoryRememberedEventPayload = {
  entryId: string
  ref: string
  category: string
  dedupeKey: string
  operation: 'created' | 'merged' | 'noop'
  contentChars: number
}

const appendMemoryEvent = (params: {
  historyPath: string
  focusId: FocusId
  eventRecord: SystemEventRecord
  entryId: string
  logContext: string
}): Promise<boolean> => {
  const message: HistoryMessage = {
    id: `sys-memory-${newId()}`,
    role: 'system',
    visibility: 'agent',
    ...params.eventRecord,
    createdAt: nowIso(),
    focusId: params.focusId,
  }
  return safe(
    params.logContext,
    async () => {
      await appendHistory(params.historyPath, message)
      return true
    },
    {
      fallback: false,
      meta: { focusId: params.focusId, entryId: params.entryId },
    },
  )
}

const rememberedSummary = (payload: MemoryRememberedEventPayload): string =>
  `Memory entry ${payload.entryId} ${payload.operation}.`

export const appendMemoryRememberedSystemMessage = (
  historyPath: string,
  focusId: FocusId,
  payload: MemoryRememberedEventPayload,
): Promise<boolean> =>
  appendMemoryEvent({
    historyPath,
    focusId,
    entryId: payload.entryId,
    logContext: 'appendHistory: memory_remembered_system_message',
    eventRecord: createSystemEventRecord({
      summary: rememberedSummary(payload),
      event: 'memory_remembered',
      payload: {
        entry_id: payload.entryId,
        ref: payload.ref,
        category: payload.category,
        dedupe_key: payload.dedupeKey,
        operation: payload.operation,
        content_chars: payload.contentChars,
      },
    }),
  })
