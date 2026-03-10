import { nowIso } from '../shared/utils.js'

import { MAX_FOCUS_OPEN_ITEMS } from './constants.js'
import { normalizeFocusOpenItems } from './open-items.js'
import { canPersistFocusContext } from './reserved.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { FocusContext } from '../types/index.js'

export const normalizeFocusSummary = (value?: string): string | undefined => {
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
