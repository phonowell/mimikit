type ParseCommaTagListOptions = {
  lowercase?: boolean
}

export const parseCommaTagList = (
  raw: string | undefined,
  options: ParseCommaTagListOptions = {},
): string[] => {
  if (!raw) return []
  const unique = new Set<string>()
  for (const part of raw.split(',')) {
    const normalized = part.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    unique.add(options.lowercase ? normalized.toLowerCase() : normalized)
  }
  return Array.from(unique)
}
