import { normalizeFocusOpenItems } from '../../focus/open-items.js'
import { compareIsoDesc } from '../../shared/time.js'

import type { FocusContext, FocusMeta } from '../../types/index.js'

export type FocusView = {
  id: string
  title: string
  status: FocusMeta['status']
  isActive: boolean
  updatedAt: string
  lastActivityAt: string
  summary?: string
  openItems?: string[]
}

const sortByLastActivityDesc = (a: FocusMeta, b: FocusMeta): number => {
  const diff = compareIsoDesc(a.lastActivityAt, b.lastActivityAt)
  if (diff !== 0) return diff
  return a.id.localeCompare(b.id)
}

const normalizeSummary = (value?: string): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export const buildFocusViews = (
  focuses: FocusMeta[],
  focusContexts: FocusContext[],
  activeFocusIds: string[],
  limit = 200,
): { items: FocusView[] } => {
  const activeSet = new Set(activeFocusIds)
  const contextById = new Map(
    focusContexts.map((context) => [context.focusId, context] as const),
  )
  const items = focuses
    .filter((focus) => focus.status !== 'archived')
    .sort(sortByLastActivityDesc)
    .slice(0, Math.max(0, limit))
    .map((focus) => {
      const context = contextById.get(focus.id)
      const summary = normalizeSummary(context?.summary)
      const openItems = normalizeFocusOpenItems(context?.openItems)
      return {
        id: focus.id,
        title: focus.title,
        status: focus.status,
        isActive: activeSet.has(focus.id),
        updatedAt: focus.updatedAt,
        lastActivityAt: focus.lastActivityAt,
        ...(summary ? { summary } : {}),
        ...(openItems ? { openItems } : {}),
      }
    })
  return { items }
}
