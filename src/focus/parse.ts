import { logSafeError } from '../log/safe.js'

import { normalizeFocusOpenItems } from './open-items.js'

export const parseFocusOpenItems = (value?: string): string[] | undefined => {
  const normalized = value?.trim()
  if (!normalized) return undefined
  if (!normalized.startsWith('[')) return undefined
  try {
    const parsed = JSON.parse(normalized) as unknown
    if (!Array.isArray(parsed)) return undefined
    if (parsed.length === 0) return []
    return normalizeFocusOpenItems(parsed, { coerceNonString: true }) ?? []
  } catch (error) {
    const rawPreview =
      normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
    void logSafeError('parseFocusOpenItems:json_parse', error, {
      meta: { rawPreview },
    })
    return undefined
  }
}
