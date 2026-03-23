import { nowIso } from '../shared/utils.js'

import { MAX_FOCUS_OPEN_ITEMS } from './constants.js'
import {
  MAX_FOCUS_OPEN_ITEM_CHARS,
  MAX_FOCUS_SUMMARY_CHARS,
  normalizeFocusDigestText,
} from './digest.js'
import { normalizeFocusOpenItems } from './open-items.js'
import {
  canStoreFocusDetails,
  normalizeReservedFocusStatus,
} from './reserved.js'

import type { FocusId, FocusMeta, FocusStatus } from '../types/index.js'

export const normalizeFocusSummary = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  return normalizeFocusDigestText(value, MAX_FOCUS_SUMMARY_CHARS)
}

const markFocusUpdated = (
  focus: FocusMeta,
  timestamp: string = nowIso(),
): void => {
  focus.updatedAt = timestamp
}

export const touchFocusMeta = (
  focus: FocusMeta,
  timestamp: string = nowIso(),
): void => {
  focus.updatedAt = timestamp
  focus.lastActivityAt = timestamp
}

export const applyFocusMetaStatus = (
  focus: FocusMeta,
  focusId: FocusId,
  status: FocusStatus,
  timestamp: string = nowIso(),
): void => {
  focus.status = normalizeReservedFocusStatus(focusId, status)
  touchFocusMeta(focus, timestamp)
}

const applyFocusDetails = (
  focus: FocusMeta,
  params: {
    summary?: string
    openItems?: string[]
  },
): boolean => {
  const beforeSummary = focus.summary
  const beforeOpenItems = focus.openItems?.join('\n')
  if (!canStoreFocusDetails(focus.id)) {
    delete focus.summary
    delete focus.openItems
    return beforeSummary !== undefined || beforeOpenItems !== undefined
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
          { maxItems: MAX_FOCUS_OPEN_ITEMS },
        )
      : focus.openItems
  if (normalizedSummary) focus.summary = normalizedSummary
  else delete focus.summary
  if (normalizedOpenItems && normalizedOpenItems.length > 0)
    focus.openItems = normalizedOpenItems
  else delete focus.openItems
  return (
    focus.summary !== beforeSummary ||
    (focus.openItems?.join('\n') ?? undefined) !== beforeOpenItems
  )
}

export const updateFocusMeta = (
  focus: FocusMeta,
  params: {
    title?: string
    status?: FocusStatus
    summary?: string
    openItems?: string[]
  },
  focusId: FocusId,
  timestamp: string = nowIso(),
): void => {
  const normalizedTitle = params.title?.trim()
  const nextTitle =
    normalizedTitle && normalizedTitle.length > 0 ? normalizedTitle : undefined
  let metadataChanged = false
  if (nextTitle && nextTitle !== focus.title) {
    focus.title = nextTitle
    metadataChanged = true
  }
  if (params.summary !== undefined || params.openItems !== undefined) {
    metadataChanged =
      applyFocusDetails(focus, {
        ...(params.summary !== undefined ? { summary: params.summary } : {}),
        ...(params.openItems !== undefined
          ? { openItems: params.openItems }
          : {}),
      }) || metadataChanged
  }
  if (params.status !== undefined) {
    applyFocusMetaStatus(focus, focusId, params.status, timestamp)
    return
  }
  if (metadataChanged) markFocusUpdated(focus, timestamp)
}
