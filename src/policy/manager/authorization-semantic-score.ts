import {
  scoreTextOverlap,
  tokenizeSearchText,
} from '../../foundation/shared/text-search.js'
import { normalizeInlineWhitespace } from '../../foundation/shared/text.js'

const STRONG_TOKEN_MIN_LENGTH = 3
const STRONG_TOKEN_MATCH_COUNT = 2

export const normalizeSemanticText = (value: string | undefined): string =>
  normalizeInlineWhitespace(value ?? '')

const collectStrongTokens = (value: string): string[] =>
  tokenizeSearchText(value).filter(
    (token) =>
      !token.startsWith('cjk:') && token.length >= STRONG_TOKEN_MIN_LENGTH,
  )

export const scoreSemanticAlignment = (left: string, right: string): number => {
  const normalizedLeft = normalizeSemanticText(left)
  const normalizedRight = normalizeSemanticText(right)
  if (!normalizedLeft || !normalizedRight) return 0
  if (normalizedLeft === normalizedRight) return 1
  const overlap = Math.max(
    scoreTextOverlap(normalizedLeft, normalizedRight),
    scoreTextOverlap(normalizedRight, normalizedLeft),
  )
  const leftTokens = collectStrongTokens(normalizedLeft)
  const rightTokens = collectStrongTokens(normalizedRight)
  if (leftTokens.length === 0 || rightTokens.length === 0) return overlap
  const rightTokenSet = new Set(rightTokens)
  let shared = 0
  for (const token of leftTokens) {
    if (!rightTokenSet.has(token)) continue
    shared += 1
  }
  const sharedRatio = shared / Math.min(leftTokens.length, rightTokens.length)
  return Math.max(overlap, sharedRatio)
}

export const hasSemanticAlignment = (
  left: string,
  right: string,
  threshold: number,
): boolean => {
  const score = scoreSemanticAlignment(left, right)
  if (score >= threshold) return true
  const normalizedLeft = normalizeSemanticText(left)
  const normalizedRight = normalizeSemanticText(right)
  if (!normalizedLeft || !normalizedRight) return false
  const leftTokens = collectStrongTokens(normalizedLeft)
  const rightTokens = new Set(collectStrongTokens(normalizedRight))
  let shared = 0
  for (const token of leftTokens) {
    if (!rightTokens.has(token)) continue
    shared += 1
    if (shared >= STRONG_TOKEN_MATCH_COUNT) return true
  }
  return false
}
