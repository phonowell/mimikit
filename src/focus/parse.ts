import { normalizeFocusOpenItems } from './open-items.js'

export const parseFocusOpenItems = (value?: string): string[] | undefined => {
  const normalized = value?.trim()
  if (!normalized) return undefined
  const parts = normalized.split('||').map((item) => item.trim())
  return normalizeFocusOpenItems(parts, { coerceNonString: false })
}
