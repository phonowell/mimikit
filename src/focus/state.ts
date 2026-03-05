import { compareIsoDesc } from '../shared/time.js'
import { nowIso } from '../shared/utils.js'

import {
  GLOBAL_FOCUS_ID,
  INBOX_FOCUS_ID,
  MAX_FOCUS_OPEN_ITEMS,
} from './constants.js'
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
    .filter((item) => item.status === 'active' && item.id !== GLOBAL_FOCUS_ID)
    .sort((a, b) => {
      const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
      if (diff !== 0) return diff
      return a.id.localeCompare(b.id)
    })
  const primaryActiveFocus = activeNonGlobal.at(0)
  if (primaryActiveFocus) return primaryActiveFocus.id

  const reusableIdleFocus = runtime.focuses
    .filter(
      (item) =>
        item.status === 'idle' &&
        item.id !== GLOBAL_FOCUS_ID &&
        item.id !== INBOX_FOCUS_ID,
    )
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
    if (
      focusId === INBOX_FOCUS_ID &&
      (existing.status === 'done' || existing.status === 'archived')
    ) {
      const timestamp = nowIso()
      existing.status = 'idle'
      existing.updatedAt = timestamp
      existing.lastActivityAt = timestamp
      runtime.activeFocusIds = runtime.activeFocusIds.filter(
        (id) => id !== focusId,
      )
    }
    return existing
  }
  const timestamp = nowIso()
  const normalizedTitle = normalizeFocusSummary(title) ?? focusId
  const next: FocusMeta = {
    id: focusId,
    title: normalizedTitle,
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
  const nextStatus =
    focusId === GLOBAL_FOCUS_ID
      ? 'active'
      : focusId === INBOX_FOCUS_ID &&
          (status === 'done' || status === 'archived')
        ? 'idle'
        : status
  const timestamp = nowIso()
  focus.status = nextStatus
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
  if (nextStatus === 'active') {
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
      ? normalizeFocusSummary(params.summary)
      : normalizeFocusSummary(current?.summary)
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

export const findFocusCompressedContext = (
  runtime: RuntimeState,
  focusId: FocusId,
): RuntimeState['managerFocusCompressedContexts'][number] | undefined =>
  runtime.managerFocusCompressedContexts.find(
    (item) => item.focusId === focusId,
  )

export const upsertFocusCompressedContext = (
  runtime: RuntimeState,
  params: {
    focusId: FocusId
    summary: string
    firstKeptEntryId?: string
    details?: {
      historyFrom?: string
      historyTo?: string
      messageCount?: number
      taskIds?: string[]
      archivePaths?: string[]
    }
  },
): void => {
  const summary = params.summary.trim()
  if (!summary) return
  const now = nowIso()
  const next = {
    focusId: params.focusId,
    summary,
    updatedAt: now,
    ...(params.firstKeptEntryId?.trim()
      ? { firstKeptEntryId: params.firstKeptEntryId.trim() }
      : {}),
    ...(params.details
      ? {
          details: {
            ...(params.details.historyFrom
              ? { historyFrom: params.details.historyFrom }
              : {}),
            ...(params.details.historyTo
              ? { historyTo: params.details.historyTo }
              : {}),
            ...(params.details.messageCount !== undefined
              ? { messageCount: params.details.messageCount }
              : {}),
            ...(params.details.taskIds && params.details.taskIds.length > 0
              ? { taskIds: params.details.taskIds }
              : {}),
            ...(params.details.archivePaths &&
            params.details.archivePaths.length > 0
              ? { archivePaths: params.details.archivePaths }
              : {}),
          },
        }
      : {}),
  }
  const index = runtime.managerFocusCompressedContexts.findIndex(
    (item) => item.focusId === params.focusId,
  )
  if (index >= 0) runtime.managerFocusCompressedContexts[index] = next
  else runtime.managerFocusCompressedContexts.push(next)
}

export const removeFocusCompressedContexts = (
  runtime: RuntimeState,
  focusIds: FocusId[],
): void => {
  if (focusIds.length === 0) return
  const excluded = new Set(focusIds)
  runtime.managerFocusCompressedContexts =
    runtime.managerFocusCompressedContexts.filter(
      (item) => !excluded.has(item.focusId),
    )
}

export const selectFocusCompressedContexts = (
  runtime: RuntimeState,
  focusIds: FocusId[],
): RuntimeState['managerFocusCompressedContexts'] => {
  if (focusIds.length === 0) return []
  const wanted = new Set(focusIds)
  const entries = runtime.managerFocusCompressedContexts.filter((item) =>
    wanted.has(item.focusId),
  )
  if (entries.length === 0) return []
  const rank = new Map(focusIds.map((id, index) => [id, index] as const))
  return [...entries].sort((a, b) => {
    const aRank = rank.get(a.focusId) ?? Number.MAX_SAFE_INTEGER
    const bRank = rank.get(b.focusId) ?? Number.MAX_SAFE_INTEGER
    if (aRank !== bRank) return aRank - bRank
    const timeDiff = compareIsoDesc(a.updatedAt, b.updatedAt)
    if (timeDiff !== 0) return timeDiff
    return a.focusId.localeCompare(b.focusId)
  })
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
