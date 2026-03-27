import { newId, nowIso } from '../../foundation/shared/utils.js'
import {
  createSystemEventRecord,
  type SystemEventRecord,
} from '../../surface/shared/system-event.js'
import { safe } from '../log/safe.js'

import { appendHistory } from './store.js'

import type { FocusId, HistoryMessage } from '../../foundation/types/index.js'

export type ProjectProfileRememberedEventPayload = {
  entryId: string
  ref: string
  operation: 'created' | 'updated' | 'noop'
  contentChars: number
}

const appendProjectProfileEvent = (params: {
  historyPath: string
  focusId: FocusId
  eventRecord: SystemEventRecord
  entryId: string
  logContext: string
}): Promise<boolean> => {
  const message: HistoryMessage = {
    id: `sys-project-profile-${newId()}`,
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

const rememberedSummary = (
  payload: ProjectProfileRememberedEventPayload,
): string => `Project profile entry ${payload.entryId} ${payload.operation}.`

export const appendProjectProfileRememberedSystemMessage = (
  historyPath: string,
  focusId: FocusId,
  payload: ProjectProfileRememberedEventPayload,
): Promise<boolean> =>
  appendProjectProfileEvent({
    historyPath,
    focusId,
    entryId: payload.entryId,
    logContext: 'appendHistory: project_profile_remembered_system_message',
    eventRecord: createSystemEventRecord({
      summary: rememberedSummary(payload),
      event: 'project_profile_remembered',
      payload: {
        entry_id: payload.entryId,
        ref: payload.ref,
        operation: payload.operation,
        content_chars: payload.contentChars,
      },
    }),
  })
