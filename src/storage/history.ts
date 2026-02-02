import { readJsonl, updateJsonl } from './jsonl.js'

import type { HistoryMessage } from '../types/history.js'

const MAX_ITEMS = 1000

const capHistory = (items: HistoryMessage[]): HistoryMessage[] => {
  if (items.length <= MAX_ITEMS) return items
  return items.slice(Math.max(0, items.length - MAX_ITEMS))
}

export const readHistory = (path: string): Promise<HistoryMessage[]> =>
  readJsonl<HistoryMessage>(path)

export const appendHistory = async (
  path: string,
  message: HistoryMessage,
): Promise<void> => {
  await updateJsonl<HistoryMessage>(path, (current) =>
    capHistory([...current, message]),
  )
}
