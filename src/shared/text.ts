type TruncateOptions = {
  normalizeWhitespace?: boolean
  suffix?: string
}

type ClipUtf8Options = {
  trimEnd?: boolean
}

const graphemeSegmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

const toGraphemeArray = (value: string): string[] => {
  if (!value) return []
  if (!graphemeSegmenter) return Array.from(value)
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment)
}

const sliceGraphemes = (value: string, maxGraphemes: number): string => {
  if (!value || maxGraphemes <= 0) return ''
  return toGraphemeArray(value).slice(0, maxGraphemes).join('')
}

const countGraphemes = (value: string): number => toGraphemeArray(value).length

export const normalizeInlineWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const clipUtf8ByBytes = (
  value: string,
  maxBytes: number,
  options: ClipUtf8Options = {},
): string => {
  if (!value || maxBytes <= 0) return ''
  let usedBytes = 0
  const segments: string[] = []
  for (const segment of toGraphemeArray(value)) {
    const segmentBytes = Buffer.byteLength(segment, 'utf8')
    if (usedBytes + segmentBytes > maxBytes) break
    segments.push(segment)
    usedBytes += segmentBytes
  }
  const clipped = segments.join('')
  return options.trimEnd === false ? clipped : clipped.trimEnd()
}

export const truncateText = (
  value: string,
  maxChars: number,
  options: TruncateOptions = {},
): string => {
  const maxGraphemes = Math.max(0, Math.trunc(maxChars))
  if (maxGraphemes <= 0) return ''
  const suffix = options.suffix ?? '...'
  const normalized = options.normalizeWhitespace
    ? normalizeInlineWhitespace(value)
    : value
  if (countGraphemes(normalized) <= maxGraphemes) return normalized
  const suffixText =
    countGraphemes(suffix) <= maxGraphemes
      ? suffix
      : sliceGraphemes(suffix, maxGraphemes)
  let headLength = Math.max(0, maxGraphemes - countGraphemes(suffixText))
  let nextSuffix = suffixText
  if (headLength === 0 && maxGraphemes > 0) {
    headLength = 1
    nextSuffix = sliceGraphemes(suffixText, maxGraphemes - 1)
  }
  const head = sliceGraphemes(normalized, headLength).trimEnd()
  return `${head}${nextSuffix}`
}

export const clipCompactText = (
  value: string,
  maxChars: number,
  suffix = '…',
): string =>
  truncateText(value, maxChars, {
    normalizeWhitespace: true,
    suffix,
  })
