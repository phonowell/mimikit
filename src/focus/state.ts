import { compareIsoDesc } from '../shared/time.js'
import { nowIso } from '../shared/utils.js'

import { GLOBAL_FOCUS_ID, INBOX_FOCUS_ID } from './constants.js'
import {
  canPersistFocusContext,
  initialFocusStatus,
  isDefaultActiveFocusCandidate,
  isDefaultIdleFocusCandidate,
  normalizeReservedFocusStatus,
} from './reserved.js'
import { upsertFocusContext } from './state-context.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusId, FocusMeta, FocusStatus } from '../types/index.js'

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

const normalizeFocusSummary = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

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
  runtime.focusContexts = runtime.focusContexts.filter((item) =>
    canPersistFocusContext(item.focusId),
  )
  const global = ensureFocus(runtime, GLOBAL_FOCUS_ID, 'Global')
  if (global.status !== 'active') {
    global.status = 'active'
    global.updatedAt = nowIso()
    global.lastActivityAt = global.updatedAt
  }
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
  const normalizedSummary = normalizeFocusSummary(params.summary)
  const summaryForContext =
    normalizedSummary ??
    nextTitle ??
    (params.summary !== undefined ? '' : undefined)
  const timestamp = nowIso()
  if (nextTitle) focus.title = nextTitle
  if (params.status !== undefined) focus.status = params.status
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
  if (params.status !== undefined)
    setFocusStatus(runtime, params.id, params.status)
  if (
    params.summary !== undefined ||
    params.openItems !== undefined ||
    nextTitle !== undefined
  ) {
    upsertFocusContext(runtime, {
      focusId: params.id,
      ...(summaryForContext !== undefined
        ? { summary: summaryForContext }
        : {}),
      ...(params.openItems !== undefined
        ? { openItems: params.openItems }
        : {}),
    })
  }
}
