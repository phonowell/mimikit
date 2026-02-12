import { selectByWindow } from './select-window.js'

import type { HistoryMessage } from '../../types/index.js'

export type HistorySelectParams = {
  minCount: number
  maxCount: number
  maxBytes: number
}

const SYSTEM_ROLE_MAX_RATIO = 0.4

const collectRecentHistory = (history: HistoryMessage[]): HistoryMessage[] => {
  const recent: HistoryMessage[] = []
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i]
    if (!item) continue
    recent.push(item)
  }
  return recent
}

const estimateHistoryMessageBytes = (item: HistoryMessage): number =>
  Buffer.byteLength(JSON.stringify(item), 'utf8')

/** Drop oldest system messages when they exceed ratio cap */
const rebalanceRoles = (selected: HistoryMessage[]): HistoryMessage[] => {
  const systemCount = selected.filter((i) => i.role === 'system').length
  const maxSystem = Math.max(
    1,
    Math.floor(selected.length * SYSTEM_ROLE_MAX_RATIO),
  )
  if (systemCount <= maxSystem) return selected
  let toDrop = systemCount - maxSystem
  const dropIndices = new Set<number>()
  for (let i = selected.length - 1; i >= 0 && toDrop > 0; i -= 1) {
    if (selected[i]?.role === 'system') {
      dropIndices.add(i)
      toDrop -= 1
    }
  }
  return selected.filter((_, i) => !dropIndices.has(i))
}

/** Pull in messages referenced by quote but missing from selection */
const patchQuoteChain = (
  selected: HistoryMessage[],
  allHistory: HistoryMessage[],
): HistoryMessage[] => {
  const selectedIds = new Set(selected.map((i) => i.id))
  const missing: HistoryMessage[] = []
  for (const item of selected) {
    if (!item.quote || selectedIds.has(item.quote)) continue
    const target = allHistory.find((h) => h.id === item.quote)
    if (target && !selectedIds.has(target.id)) {
      missing.push(target)
      selectedIds.add(target.id)
    }
  }
  if (missing.length === 0) return selected
  return [...missing, ...selected]
}

export const selectRecentHistory = (
  history: HistoryMessage[],
  params: HistorySelectParams,
): HistoryMessage[] => {
  if (history.length === 0) return []
  const recent = collectRecentHistory(history)
  let selected = selectByWindow(recent, params, estimateHistoryMessageBytes)
  selected = rebalanceRoles(selected)
  selected.reverse()
  return patchQuoteChain(selected, history)
}
