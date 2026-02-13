import { selectByWindow } from './select-window.js'

import type { HistoryMessage } from '../../types/index.js'

export type HistorySelectParams = {
  minCount: number
  maxCount: number
  maxBytes: number
}

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

export type HistorySelectResult = {
  selected: HistoryMessage[]
  truncated: HistoryMessage[]
}

export const selectRecentHistory = (
  history: HistoryMessage[],
  params: HistorySelectParams,
): HistorySelectResult => {
  if (history.length === 0) return { selected: [], truncated: [] }
  const recent = collectRecentHistory(history)
  const selected = selectByWindow(recent, params, estimateHistoryMessageBytes)
  const selectedIds = new Set(selected.map((i) => i.id))
  const truncated = history.filter((i) => !selectedIds.has(i.id))
  selected.reverse()
  return {
    selected: patchQuoteChain(selected, history),
    truncated,
  }
}
