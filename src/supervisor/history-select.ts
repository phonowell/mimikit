import type { HistoryMessage } from '../types/index.js'

export type HistorySelectParams = {
  excludeIds?: Set<string>
  minCount: number
  maxCount: number
  maxBytes: number
}

export const selectRecentHistory = (
  history: HistoryMessage[],
  params: HistorySelectParams,
): HistoryMessage[] => {
  const { excludeIds } = params
  const filtered = excludeIds
    ? history.filter((item) => !excludeIds.has(item.id))
    : history
  const historyMin = Math.max(0, params.minCount)
  const historyMax = Math.max(historyMin, params.maxCount)
  const historyMaxBytes = Math.max(0, params.maxBytes)
  const recent: HistoryMessage[] = []
  let totalBytes = 0
  for (let i = filtered.length - 1; i >= 0; i -= 1) {
    const item = filtered[i]
    if (!item) continue
    const itemBytes = Buffer.byteLength(JSON.stringify(item), 'utf8')
    totalBytes += itemBytes
    recent.push(item)
    if (recent.length >= historyMax) break
    if (historyMaxBytes > 0 && totalBytes > historyMaxBytes)
      if (recent.length >= historyMin) break
  }
  recent.reverse()
  return recent
}
