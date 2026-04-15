import {
  createSystemEventRecord,
  type SystemEventRecord,
} from '../../surface/shared/system-event.js'
import { safe } from '../log/safe.js'

import { appendHistory } from './store.js'
import { createSystemHistoryMessage } from './system-message.js'

import type { FocusId } from '../../foundation/types/index.js'

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
  const message = createSystemHistoryMessage({
    idPrefix: 'sys-project-profile',
    visibility: 'agent',
    focusId: params.focusId,
    eventRecord: params.eventRecord,
  })
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
