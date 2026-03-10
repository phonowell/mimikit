import { nowIso } from '../shared/utils.js'

import { MAX_FOCUS_OPEN_ITEMS } from './constants.js'
import { normalizeFocusOpenItems } from './open-items.js'
import { canPersistFocusDigest } from './reserved.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusDigest, FocusId } from '../types/index.js'

export const normalizeFocusSummary = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export const upsertFocusDigest = (
  runtime: RuntimeState,
  params: {
    focusId: FocusId
    summary?: string
    openItems?: string[]
  },
): void => {
  const index = runtime.focusDigests.findIndex(
    (item) => item.focusId === params.focusId,
  )
  if (!canPersistFocusDigest(params.focusId)) {
    if (index >= 0) runtime.focusDigests.splice(index, 1)
    return
  }
  const current: FocusDigest | undefined =
    index >= 0 ? runtime.focusDigests[index] : undefined
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
    if (index >= 0) runtime.focusDigests.splice(index, 1)
    return
  }
  const next: FocusDigest = {
    focusId: params.focusId,
    ...(normalizedSummary ? { summary: normalizedSummary } : {}),
    ...(normalizedOpenItems ? { openItems: normalizedOpenItems } : {}),
    updatedAt: nowIso(),
  }
  if (index >= 0) runtime.focusDigests[index] = next
  else runtime.focusDigests.push(next)
}
