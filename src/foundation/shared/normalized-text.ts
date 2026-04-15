const clausePattern = /\s*(?:\r?\n|；|;)\s*/u

export const normalizeTextLine = (value: string): string => value.trim()

export const normalizeUniqueTextList = (
  values: readonly string[],
): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const item of values) {
    const trimmed = normalizeTextLine(item)
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

export const splitNormalizedClauses = (value?: string): string[] =>
  !value ? [] : normalizeUniqueTextList(value.split(clausePattern))

export const clampNormalizedTextList = (
  values: readonly string[],
  max: number,
): string[] => normalizeUniqueTextList(values).slice(0, max)
