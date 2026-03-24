import { formatElapsedLabel } from './messages/format-usage.js'

export const formatElapsedText = (
  elapsedMs: number | undefined,
  hasUsage: boolean,
): string => {
  const label = formatElapsedLabel(elapsedMs)
  if (!label) return ''
  return hasUsage ? `· ${label}` : label
}
