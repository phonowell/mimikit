import { GLOBAL_FOCUS_ID, INBOX_FOCUS_ID } from './constants.js'

import type { FocusId, FocusMeta, FocusStatus } from '../types/index.js'

export const isGlobalFocusId = (focusId: FocusId): boolean =>
  focusId === GLOBAL_FOCUS_ID

export const isInboxFocusId = (focusId: FocusId): boolean =>
  focusId === INBOX_FOCUS_ID

export const isDefaultActiveFocusCandidate = (
  focus: Pick<FocusMeta, 'id' | 'status'>,
): boolean => focus.status === 'active' && !isGlobalFocusId(focus.id)

export const isDefaultIdleFocusCandidate = (
  focus: Pick<FocusMeta, 'id' | 'status'>,
): boolean =>
  focus.status === 'idle' &&
  !isGlobalFocusId(focus.id) &&
  !isInboxFocusId(focus.id)

export const isBusinessActiveFocus = (
  focus: Pick<FocusMeta, 'id' | 'status'>,
): boolean => focus.status === 'active' && !isGlobalFocusId(focus.id)

export const normalizeReservedFocusStatus = (
  focusId: FocusId,
  status: FocusStatus,
): FocusStatus => {
  if (isGlobalFocusId(focusId)) return 'active'
  if (isInboxFocusId(focusId) && (status === 'done' || status === 'archived'))
    return 'idle'
  return status
}

export const initialFocusStatus = (focusId: FocusId): FocusStatus =>
  normalizeReservedFocusStatus(focusId, 'idle')

export const canPersistFocusContext = (focusId: FocusId): boolean =>
  !isGlobalFocusId(focusId)

export const canPersistFocusCompressedContext = (focusId: FocusId): boolean =>
  !isGlobalFocusId(focusId)
