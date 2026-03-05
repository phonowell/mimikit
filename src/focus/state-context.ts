import { compareIsoDesc } from '../shared/time.js'
import { nowIso } from '../shared/utils.js'

import { MAX_FOCUS_OPEN_ITEMS } from './constants.js'
import { normalizeFocusOpenItems } from './open-items.js'
import {
  canPersistFocusCompressedContext,
  canPersistFocusContext,
} from './reserved.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusContext, FocusId } from '../types/index.js'

const normalizeFocusSummary = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
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
  if (!canPersistFocusContext(params.focusId)) {
    if (index >= 0) runtime.focusContexts.splice(index, 1)
    return
  }
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
  if (!canPersistFocusCompressedContext(params.focusId)) {
    runtime.managerFocusCompressedContexts =
      runtime.managerFocusCompressedContexts.filter(
        (item) => item.focusId !== params.focusId,
      )
    return
  }
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
