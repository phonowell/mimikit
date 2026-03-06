import { computeRecencyWeight } from '../shared/time.js'

const TOKEN_RE = /\p{L}[\p{L}\p{N}_-]*/gu

export const tokenizeSearchText = (text: string): string[] =>
  (text.toLowerCase().match(TOKEN_RE) ?? []).map((token) => token.trim())

export const truncatePreview = (value: string, maxChars: number): string => {
  const compact = value.trim().replace(/\s+/g, ' ')
  if (compact.length <= maxChars) return compact
  return `${compact.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

const scoreByTokenOverlap = (
  queryTokens: string[],
  haystackTokens: string[],
) => {
  if (queryTokens.length === 0 || haystackTokens.length === 0) return 0
  const haystackSet = new Set(haystackTokens)
  let hitCount = 0
  for (const token of queryTokens) if (haystackSet.has(token)) hitCount += 1
  return hitCount / queryTokens.length
}

export const scoreQueryCandidate = (params: {
  query: string
  isWildcard: boolean
  haystack: string
  timeMs: number
  oldestMs: number
  newestMs: number
}): number => {
  const recency = computeRecencyWeight(
    params.timeMs,
    params.oldestMs,
    params.newestMs,
  )
  if (params.isWildcard) return 0.7 + recency * 0.3
  const queryTokens = tokenizeSearchText(params.query)
  const haystackTokens = tokenizeSearchText(params.haystack)
  const overlap = scoreByTokenOverlap(queryTokens, haystackTokens)
  if (overlap <= 0) return 0
  return overlap * 0.85 + recency * 0.15
}

export const sortByScoreTimeId = <
  T extends { score: number; timeMs: number; id: string },
>(
  items: T[],
): T[] =>
  [...items].sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score
    if (left.timeMs !== right.timeMs) return right.timeMs - left.timeMs
    return left.id.localeCompare(right.id)
  })
