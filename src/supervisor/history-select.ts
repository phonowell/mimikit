import { selectByWindow } from './select-window.js'

import type { HistoryMessage } from '../types/index.js'

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

export const selectRecentHistory = (
  history: HistoryMessage[],
  params: HistorySelectParams,
): HistoryMessage[] => {
  if (history.length === 0) return []
  const recent = collectRecentHistory(history)
  const selected = selectByWindow(recent, params, estimateHistoryMessageBytes)
  selected.reverse()
  return selected
}
