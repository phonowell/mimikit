const normalizeKey = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().toLowerCase()

export const dedupeConsecutiveLines = (value: string): string => {
  const lines = value.split('\n')
  const next: string[] = []
  let previousLineKey: string | undefined
  let previousBlank = false
  for (const line of lines) {
    if (!line.trim()) {
      if (previousBlank) continue
      next.push('')
      previousBlank = true
      previousLineKey = undefined
      continue
    }
    previousBlank = false
    const key = normalizeKey(line)
    if (key && key === previousLineKey) continue
    previousLineKey = key
    next.push(line.trimEnd())
  }
  return next.join('\n')
}

export const dedupeConsecutiveParagraphs = (value: string): string => {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (paragraphs.length <= 1) return paragraphs.join('\n\n')
  const next: string[] = []
  let previousKey: string | undefined
  for (const paragraph of paragraphs) {
    const key = normalizeKey(paragraph)
    if (key && key === previousKey) continue
    previousKey = key
    next.push(paragraph)
  }
  return next.join('\n\n')
}

export const joinUnique = (items: string[]): string => {
  const next: string[] = []
  for (const item of items) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = normalizeKey(trimmed)
    if (next.some((existing) => normalizeKey(existing) === key)) continue
    next.push(trimmed)
  }
  return next.join(' ')
}
