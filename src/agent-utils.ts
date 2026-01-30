export const truncate = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text
  if (maxChars <= 3) return text.slice(0, maxChars)
  return `${text.slice(0, maxChars - 3)}...`
}

export const withOptional = <T extends string, V>(
  key: T,
  value: V | undefined,
): Partial<Record<T, V>> => {
  if (value === undefined) return {}
  const entry: Partial<Record<T, V>> = {}
  entry[key] = value
  return entry
}

export const formatTimestamp = (date = new Date()): string =>
  date.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-')
