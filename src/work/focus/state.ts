import { compareIsoDesc } from '../../foundation/shared/time.js'
import { nowIso } from '../../foundation/shared/utils.js'

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
} from '../../kernel/orchestrator/runtime-interfaces.js'

export { normalizeFocusSummary } from './meta.js'

const findFocusIndex = (
  focuses: RuntimeFocusCollection,
  focusId: FocusId,
): number => focuses.findIndex((focus) => focus.id === focusId)

type FocusCollectionRuntime = {
  domain: {
    focuses: RuntimeFocusCollection
  }
}

export const findRuntimeFocus = (
  runtime: FocusCollectionRuntime,
  focusId: FocusId,
): FocusMeta | undefined =>
  runtime.domain.focuses.find((focus) => focus.id === focusId)

export const appendRuntimeFocus = (params: {
  runtime: FocusCollectionRuntime
  focus: FocusMeta
}): FocusMeta => {
  params.runtime.domain.focuses = [
    ...params.runtime.domain.focuses,
    params.focus,
  ]
  return params.focus
}

export const removeRuntimeFocus = (params: {
  runtime: FocusCollectionRuntime
  focusId: FocusId
}): FocusMeta | undefined => {
  const index = findFocusIndex(params.runtime.domain.focuses, params.focusId)
  if (index < 0) return undefined
  const focus = params.runtime.domain.focuses[index]
  params.runtime.domain.focuses = params.runtime.domain.focuses.filter(
    (item) => item.id !== params.focusId,
  )
  return focus
}

export const resolveDefaultFocusId = (runtime: FocusRuntime): FocusId => {
  const activeNonGlobal = runtime.domain.focuses
    .filter(isDefaultActiveFocusCandidate)
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
  const primaryActiveFocus = activeNonGlobal.at(0)
  if (primaryActiveFocus) return primaryActiveFocus.id

  const reusableIdleFocus = runtime.domain.focuses
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
): FocusMeta | undefined => findRuntimeFocus(runtime, focusId)

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
  return appendRuntimeFocus({ runtime, focus: next })
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
    return
  }
  if (hadDetails) global.updatedAt = nowIso()
}

export const touchFocus = (
  runtime: FocusCollectionRuntime,
  focusId: FocusId,
): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  touchFocusMeta(focus)
}

export const setFocusStatus = (
  runtime: FocusCollectionRuntime,
  focusId: FocusId,
  status: FocusStatus,
): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  applyFocusMetaStatus(focus, focusId, status)
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
}
