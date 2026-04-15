export const toPrettyJsonText = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value ? (value as Record<string, unknown>) : null

export const asString = (
  value: Record<string, unknown> | null,
  key: string,
): string | undefined => {
  if (!value) return undefined
  const target = value[key]
  return typeof target === 'string' ? target : undefined
}
