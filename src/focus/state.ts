import { nowIso } from '../shared/utils.js'
import { compareIsoDesc } from '../shared/time.js'

import { GLOBAL_FOCUS_ID, MAX_FOCUS_OPEN_ITEMS } from './constants.js'
import { normalizeFocusOpenItems } from './open-items.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  FocusContext,
  FocusId,
  FocusMeta,
  FocusStatus,
} from '../types/index.js'

export const resolveDefaultFocusId = (runtime: RuntimeState): FocusId => {
  const activeNonGlobal = runtime.focuses
    .filter(
      (item) => item.status === 'active' && item.id !== GLOBAL_FOCUS_ID,
    )
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
  const primaryActiveFocus = activeNonGlobal.at(0)
  if (primaryActiveFocus) return primaryActiveFocus.id
  const activeFallback = runtime.activeFocusIds.find((id) =>
    runtime.focuses.some((item) => item.id === id && item.status === 'active'),
  )
  return activeFallback ?? GLOBAL_FOCUS_ID
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
  if (existing) return existing
  const timestamp = nowIso()
  const next: FocusMeta = {
    id: focusId,
    title: title?.trim() || focusId,
    status: focusId === GLOBAL_FOCUS_ID ? 'active' : 'idle',
    createdAt: timestamp,
    updatedAt: timestamp,
    lastActivityAt: timestamp,
  }
  runtime.focuses.push(next)
  if (next.status === 'active' && !runtime.activeFocusIds.includes(next.id))
    runtime.activeFocusIds.push(next.id)
  return next
}

export const ensureGlobalFocus = (runtime: RuntimeState): void => {
  const global = ensureFocus(runtime, GLOBAL_FOCUS_ID, 'Global')
  if (global.status !== 'active') {
    global.status = 'active'
    global.updatedAt = nowIso()
    global.lastActivityAt = global.updatedAt
  }
  if (!runtime.activeFocusIds.includes(GLOBAL_FOCUS_ID))
    runtime.activeFocusIds.unshift(GLOBAL_FOCUS_ID)
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
  const timestamp = nowIso()
  focus.status = status
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
  if (status === 'active') {
    if (!runtime.activeFocusIds.includes(focusId))
      runtime.activeFocusIds.push(focusId)
    return
  }
  runtime.activeFocusIds = runtime.activeFocusIds.filter((id) => id !== focusId)
}

export const upsertFocusContext = (
  runtime: RuntimeState,
  params: {
    focusId: FocusId
    summary?: string
    openItems?: string[]
  },
): void => {
  const index = runtime.focusContexts.findIndex(
    (item) => item.focusId === params.focusId,
  )
  const current: FocusContext | undefined =
    index >= 0 ? runtime.focusContexts[index] : undefined
  const normalizedSummary =
    params.summary !== undefined
      ? params.summary.trim() || undefined
      : current?.summary
  const normalizedOpenItems =
    params.openItems !== undefined
      ? normalizeFocusOpenItems(params.openItems, {
          maxItems: MAX_FOCUS_OPEN_ITEMS,
        })
      : current?.openItems
  if (
    !normalizedSummary &&
    (!normalizedOpenItems || normalizedOpenItems.length === 0)
  ) {
    if (index >= 0) runtime.focusContexts.splice(index, 1)
    return
  }
  const next: FocusContext = {
    focusId: params.focusId,
    ...(normalizedSummary ? { summary: normalizedSummary } : {}),
    ...(normalizedOpenItems ? { openItems: normalizedOpenItems } : {}),
    updatedAt: nowIso(),
  }
  if (index >= 0) runtime.focusContexts[index] = next
  else runtime.focusContexts.push(next)
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
  const timestamp = nowIso()
  if (params.title !== undefined)
    focus.title = params.title.trim() || focus.title
  if (params.status !== undefined) focus.status = params.status
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
  if (params.status !== undefined)
    setFocusStatus(runtime, params.id, params.status)
  if (params.summary !== undefined || params.openItems !== undefined) {
    upsertFocusContext(runtime, {
      focusId: params.id,
      ...(params.summary !== undefined ? { summary: params.summary } : {}),
      ...(params.openItems !== undefined
        ? { openItems: params.openItems }
        : {}),
    })
  }
}
