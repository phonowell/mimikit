import { logSafeError } from '../log/safe.js'

export const parseFocusOpenItems = (value?: string): string[] | undefined => {
  const normalized = value?.trim()
  if (!normalized) return undefined
  if (normalized.startsWith('[')) {
    try {
      const parsed = JSON.parse(normalized) as unknown
      if (Array.isArray(parsed))
        return parsed
          .map((item) => String(item).trim())
          .filter((item) => item.length > 0)
    } catch (error) {
      const rawPreview =
        normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
      void logSafeError('parseFocusOpenItems:json_parse', error, {
        meta: { rawPreview },
      })
    }
  }
  return normalized
    .split('||')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
