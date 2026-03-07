import { scoreTextOverlap, tokenizeSearchText } from '../shared/text-search.js'
import { truncateText } from '../shared/text.js'
import { computeRecencyWeight } from '../shared/time.js'

export { tokenizeSearchText }

export const truncatePreview = (value: string, maxChars: number): string => {
  const compact = value.trim().replace(/\s+/g, ' ')
  return truncateText(compact, maxChars, { suffix: '…' })
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
  const overlap = scoreTextOverlap(params.query, params.haystack)
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
