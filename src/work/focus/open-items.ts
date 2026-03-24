type NormalizeFocusOpenItemsOptions = {
  maxItems?: number
  coerceNonString?: boolean
}

const resolveValue = (item: unknown, coerceNonString: boolean): string =>
  typeof item === 'string' ? item : coerceNonString ? String(item) : ''

export const normalizeFocusOpenItems = (
  value: readonly unknown[] | undefined,
  options: NormalizeFocusOpenItemsOptions = {},
): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const coerceNonString = options.coerceNonString === true
  const items = value
    .map((item) => resolveValue(item, coerceNonString).trim())
    .filter((item) => item.length > 0)
  if (items.length === 0) return undefined
  if (options.maxItems !== undefined) {
    const maxItems = Math.max(0, Math.trunc(options.maxItems))
    if (maxItems === 0) return undefined
    const bounded = items.slice(0, maxItems)
    return bounded.length > 0 ? bounded : undefined
  }
  return items
}
