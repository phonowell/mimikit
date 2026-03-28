import { compareIsoDesc } from '../../foundation/shared/time.js'
import { nowIso } from '../../foundation/shared/utils.js'
import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'

import { GLOBAL_FOCUS_ID, INBOX_FOCUS_ID } from './constants.js'
import {
  applyFocusMetaStatus,
  normalizeFocusSummary,
  touchFocusMeta,
  updateFocusMeta,
} from './meta.js'
import {
  initialFocusStatus,
  isDefaultActiveFocusCandidate,
  isDefaultIdleFocusCandidate,
  normalizeReservedFocusStatus,
} from './reserved.js'

import type {
  FocusId,
  FocusMeta,
  FocusStatus,
} from '../../foundation/types/index.js'
import type {
  FocusRuntime,
  RuntimeFocusCollection,
  RuntimeUiState,
} from '../../kernel/orchestrator/runtime-interfaces.js'

export { normalizeFocusSummary } from './meta.js'

type FocusCollectionRuntime = {
  focuses: RuntimeFocusCollection
  ui?: Pick<RuntimeUiState, 'wakeVersion' | 'wakeEvents' | 'signalControllers'>
}

const notifyFocusesChanged = (runtime: FocusCollectionRuntime): void => {
  if (!runtime.ui) return
  notifyUiSignal({ ui: runtime.ui }, 'focuses')
}

export const resolveDefaultFocusId = (runtime: FocusRuntime): FocusId => {
  const activeNonGlobal = runtime.focuses
    .filter(isDefaultActiveFocusCandidate)
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
  const primaryActiveFocus = activeNonGlobal.at(0)
  if (primaryActiveFocus) return primaryActiveFocus.id

  const reusableIdleFocus = runtime.focuses
    .filter(isDefaultIdleFocusCandidate)
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
    .at(0)
  if (reusableIdleFocus) return reusableIdleFocus.id

  return INBOX_FOCUS_ID
}

export const findFocus = (
  runtime: FocusCollectionRuntime,
  focusId: FocusId,
): FocusMeta | undefined => runtime.focuses.find((item) => item.id === focusId)

export const ensureFocus = (
  runtime: FocusCollectionRuntime,
  focusId: FocusId,
  title?: string,
): FocusMeta => {
  const existing = findFocus(runtime, focusId)
  if (existing) {
    const normalizedStatus = normalizeReservedFocusStatus(
      focusId,
      existing.status,
    )
    if (normalizedStatus !== existing.status)
      applyFocusMetaStatus(existing, focusId, normalizedStatus)
    return existing
  }
  const timestamp = nowIso()
  const normalizedTitle = normalizeFocusSummary(title) ?? focusId
  const next: FocusMeta = {
    id: focusId,
    title: normalizedTitle,
    status: initialFocusStatus(focusId),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,
  }
  runtime.focuses.push(next)
  notifyFocusesChanged(runtime)
  return next
}

export const ensureGlobalFocus = (runtime: FocusRuntime): void => {
  const global = ensureFocus(runtime, GLOBAL_FOCUS_ID, 'Global')
  const hadDetails =
    Boolean(global.summary) || Boolean(global.openItems?.length)
  if (hadDetails) {
    delete global.summary
    delete global.openItems
  }
  if (global.status !== 'active') {
    applyFocusMetaStatus(global, GLOBAL_FOCUS_ID, 'active')
    notifyFocusesChanged(runtime)
    return
  }
  if (hadDetails) {
    global.updatedAt = nowIso()
    notifyFocusesChanged(runtime)
  }
}

export const touchFocus = (
  runtime: FocusCollectionRuntime,
  focusId: FocusId,
): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  touchFocusMeta(focus)
  notifyFocusesChanged(runtime)
}

export const setFocusStatus = (
  runtime: FocusCollectionRuntime,
  focusId: FocusId,
  status: FocusStatus,
): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  applyFocusMetaStatus(focus, focusId, status)
  notifyFocusesChanged(runtime)
}

export const updateFocus = (
  runtime: FocusCollectionRuntime,
  params: {
    id: FocusId
    title?: string
    status?: FocusStatus
    summary?: string
    openItems?: string[]
  },
): void => {
  const focus = findFocus(runtime, params.id) ?? ensureFocus(runtime, params.id)
  updateFocusMeta(focus, params, params.id, nowIso())
  notifyFocusesChanged(runtime)
}
