import type { HistoryMessage } from '../types/history.js'

const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

export const selectHistory = (params: {
  history: HistoryMessage[]
  budget: number
  min: number
  max: number
}): HistoryMessage[] => {
  const seen = new Set<string>()
  const unique = params.history.filter((msg) => {
    const key = `${msg.createdAt}::${msg.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const sorted = [...unique].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
  const selected: HistoryMessage[] = []
  let used = 0
  for (const msg of sorted) {
    const tokens = estimateTokens(msg.text)
    if (selected.length >= params.max) break
    if (used + tokens > params.budget && selected.length >= params.min) break
    selected.push({
      ...msg,
      text: msg.text.length > 500 ? `${msg.text.slice(0, 500)}…` : msg.text,
    })
    used += tokens
  }
  return selected.reverse()
}
