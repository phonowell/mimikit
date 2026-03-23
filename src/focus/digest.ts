import { truncateText } from '../shared/text.js'

const DIGEST_LIST_PREFIX_RE = /^\s*(?:[-*+]|\d+[.)]|\[[ xX]\])\s+/

export const MAX_FOCUS_SUMMARY_CHARS = 140
export const MAX_FOCUS_OPEN_ITEM_CHARS = 80

const normalizeSingleLine = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const hasExecutionListShape = (value: string): boolean =>
  DIGEST_LIST_PREFIX_RE.test(value)

export const normalizeFocusDigestText = (
  value: string,
  maxChars: number,
): string | undefined => {
  const normalized = normalizeSingleLine(value)
  if (!normalized) return undefined
  return truncateText(normalized, maxChars, {
    normalizeWhitespace: true,
    suffix: '...',
  })
}

export const validateFocusDigestText = (params: {
  key: string
  value: string
  maxChars: number
}): string | undefined => {
  const { key, value, maxChars } = params
  if (value.includes('\n') || value.includes('\r'))
    return `${key} must be a single-line digest`
  if (hasExecutionListShape(value))
    return `${key} must be digest text, not a checklist or step list`
  const normalized = normalizeSingleLine(value)
  if (!normalized) return `${key} must be non-empty`
  if (normalized.length > maxChars) return `${key} must be <= ${maxChars} chars`
  return undefined
}
