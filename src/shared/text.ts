type TruncateOptions = {
  normalizeWhitespace?: boolean
  suffix?: string
}

export const normalizeInlineWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

export const truncateText = (
  value: string,
  maxChars: number,
  options: TruncateOptions = {},
): string => {
  const suffix = options.suffix ?? '...'
  const normalized = options.normalizeWhitespace
    ? normalizeInlineWhitespace(value)
    : value
  if (normalized.length <= maxChars) return normalized
  const head = Math.max(0, maxChars - suffix.length)
  return `${normalized.slice(0, head).trimEnd()}${suffix}`
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
