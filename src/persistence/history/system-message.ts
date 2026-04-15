import { newId, nowIso } from '../../foundation/shared/utils.js'

import type {
  FocusId,
  MessageVisibility,
} from '../../foundation/types/index.js'
import type { SystemEventRecord } from '../../surface/shared/system-event.js'
import type { HistoryMessage } from '../../surface/types/message-types.js'

export const createSystemHistoryMessage = (params: {
  idPrefix: string
  visibility: MessageVisibility
  focusId: FocusId
  eventRecord: SystemEventRecord
  createdAt?: string
}): HistoryMessage => ({
  id: `${params.idPrefix}-${newId()}`,
  role: 'system',
  visibility: params.visibility,
  ...params.eventRecord,
  ...(params.createdAt
    ? { createdAt: params.createdAt }
    : { createdAt: nowIso() }),
  focusId: params.focusId,
})
