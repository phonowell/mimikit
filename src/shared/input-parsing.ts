export const readNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export const readBooleanFlag = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  if (/^(1|true|yes|on)$/i.test(normalized)) return true
  if (/^(0|false|no|off)$/i.test(normalized)) return false
  return undefined
}
