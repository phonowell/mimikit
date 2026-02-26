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
    } catch {}
  }
  return normalized
    .split('||')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
