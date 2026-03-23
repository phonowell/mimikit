import { compareIsoDesc } from '../shared/time.js'
import { nowIso } from '../shared/utils.js'

import {
  GLOBAL_FOCUS_ID,
  INBOX_FOCUS_ID,
  MAX_FOCUS_OPEN_ITEMS,
} from './constants.js'
import {
  MAX_FOCUS_OPEN_ITEM_CHARS,
  MAX_FOCUS_SUMMARY_CHARS,
  normalizeFocusDigestText,
} from './digest.js'
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
  return normalizeFocusDigestText(value, MAX_FOCUS_SUMMARY_CHARS)
}

const markFocusActivity = (
  focus: FocusMeta,
  timestamp: string = nowIso(),
): void => {
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
}

const applyFocusStatus = (
  focus: FocusMeta,
  focusId: FocusId,
  status: FocusStatus,
  timestamp: string = nowIso(),
): void => {
  focus.status = normalizeReservedFocusStatus(focusId, status)
  markFocusActivity(focus, timestamp)
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
      ? normalizeFocusOpenItems(
          params.openItems.map(
            (item) =>
              normalizeFocusDigestText(item, MAX_FOCUS_OPEN_ITEM_CHARS) ?? '',
          ),
          {
            maxItems: MAX_FOCUS_OPEN_ITEMS,
          },
        )
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
    if (normalizedStatus !== existing.status)
      applyFocusStatus(existing, focusId, normalizedStatus)
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
    applyFocusStatus(global, GLOBAL_FOCUS_ID, 'active')
    return
  }
  if (hadDetails) global.updatedAt = nowIso()
}

export const touchFocus = (runtime: RuntimeState, focusId: FocusId): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  markFocusActivity(focus)
}

export const setFocusStatus = (
  runtime: RuntimeState,
  focusId: FocusId,
  status: FocusStatus,
): void => {
  const focus = findFocus(runtime, focusId) ?? ensureFocus(runtime, focusId)
  applyFocusStatus(focus, focusId, status)
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
  if (params.summary !== undefined || params.openItems !== undefined) {
    applyFocusDetails(focus, {
      ...(params.summary !== undefined ? { summary: params.summary } : {}),
      ...(params.openItems !== undefined
        ? { openItems: params.openItems }
        : {}),
    })
  }
  if (params.status !== undefined) {
    applyFocusStatus(focus, params.id, params.status, timestamp)
    return
  }
  markFocusActivity(focus, timestamp)
}
