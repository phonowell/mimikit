import { compareIsoDesc } from '../shared/time.js'
import { nowIso } from '../shared/utils.js'

import {
  GLOBAL_FOCUS_ID,
  INBOX_FOCUS_ID,
  MAX_FOCUS_OPEN_ITEMS,
} from './constants.js'
import { normalizeFocusOpenItems } from './open-items.js'
import {
  canStoreFocusDetails,
  initialFocusStatus,
  isDefaultActiveFocusCandidate,
  isDefaultIdleFocusCandidate,
  normalizeReservedFocusStatus,
} from './reserved.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, FocusMeta, FocusStatus } from '../types/index.js'

export const normalizeFocusSummary = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const applyFocusDetails = (
  focus: FocusMeta,
  params: {
    summary?: string
    openItems?: string[]
  },
): void => {
  if (!canStoreFocusDetails(focus.id)) {
    delete focus.summary
    delete focus.openItems
    return
  }
  const normalizedSummary =
    params.summary !== undefined
      ? normalizeFocusSummary(params.summary)
      : normalizeFocusSummary(focus.summary)
  const normalizedOpenItems =
    params.openItems !== undefined
      ? normalizeFocusOpenItems(params.openItems, {
          maxItems: MAX_FOCUS_OPEN_ITEMS,
        })
      : focus.openItems
  if (normalizedSummary) focus.summary = normalizedSummary
  else delete focus.summary
  if (normalizedOpenItems && normalizedOpenItems.length > 0)
    focus.openItems = normalizedOpenItems
  else delete focus.openItems
}

export const resolveDefaultFocusId = (runtime: RuntimeState): FocusId => {
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
  runtime: RuntimeState,
  focusId: FocusId,
): FocusMeta | undefined => runtime.focuses.find((item) => item.id === focusId)

export const ensureFocus = (
  runtime: RuntimeState,
  focusId: FocusId,
  title?: string,
): FocusMeta => {
  const existing = findFocus(runtime, focusId)
  if (existing) {
    const normalizedStatus = normalizeReservedFocusStatus(
      focusId,
      existing.status,
    )
    if (normalizedStatus !== existing.status) {
      const timestamp = nowIso()
      existing.status = normalizedStatus
      existing.updatedAt = timestamp
      existing.lastActivityAt = timestamp
    }
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
  return next
}

export const ensureGlobalFocus = (runtime: RuntimeState): void => {
  const global = ensureFocus(runtime, GLOBAL_FOCUS_ID, 'Global')
  const hadDetails =
    Boolean(global.summary) || Boolean(global.openItems?.length)
  if (hadDetails) {
    delete global.summary
    delete global.openItems
  }
  if (global.status !== 'active') {
    global.status = 'active'
    global.updatedAt = nowIso()
    global.lastActivityAt = global.updatedAt
  } else if (hadDetails) global.updatedAt = nowIso()
}

export const touchFocus = (runtime: RuntimeState, focusId: FocusId): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  const timestamp = nowIso()
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
}

export const setFocusStatus = (
  runtime: RuntimeState,
  focusId: FocusId,
  status: FocusStatus,
): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  const nextStatus = normalizeReservedFocusStatus(focusId, status)
  const timestamp = nowIso()
  focus.status = nextStatus
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
}

export const updateFocus = (
  runtime: RuntimeState,
  params: {
    id: FocusId
    title?: string
    status?: FocusStatus
    summary?: string
    openItems?: string[]
  },
): void => {
  const focus = findFocus(runtime, params.id) ?? ensureFocus(runtime, params.id)
  const normalizedTitle = params.title?.trim()
  const nextTitle =
    normalizedTitle && normalizedTitle.length > 0 ? normalizedTitle : undefined
  const timestamp = nowIso()
  if (nextTitle) focus.title = nextTitle
  if (params.status !== undefined) focus.status = params.status
  if (params.summary !== undefined || params.openItems !== undefined) {
    applyFocusDetails(focus, {
      ...(params.summary !== undefined ? { summary: params.summary } : {}),
      ...(params.openItems !== undefined
        ? { openItems: params.openItems }
        : {}),
    })
  }
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
  if (params.status !== undefined)
    setFocusStatus(runtime, params.id, params.status)
}
