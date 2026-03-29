const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasNullBranch = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  if (value.type === 'null') return true
  if (Array.isArray(value.type)) return value.type.includes('null')
  if (Array.isArray(value.anyOf)) return value.anyOf.some(hasNullBranch)
  if (Array.isArray(value.oneOf)) return value.oneOf.some(hasNullBranch)
  return false
}

const toNullable = (value: unknown): unknown =>
  hasNullBranch(value)
    ? value
    : {
        anyOf: [value, { type: 'null' }],
      }

export const normalizeStrictOutputSchema = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeStrictOutputSchema)
  if (!isRecord(value)) return value

  const normalized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === 'oneOf') normalized.anyOf = normalizeStrictOutputSchema(child)
    else normalized[key] = normalizeStrictOutputSchema(child)
  }

  if (!isRecord(normalized.properties)) return normalized

  const { properties } = normalized
  const propertyNames = Object.keys(properties)
  if (propertyNames.length === 0) return normalized

  const required = new Set(
    Array.isArray(normalized.required)
      ? normalized.required.filter(
          (entry): entry is string => typeof entry === 'string',
        )
      : [],
  )
  const nextProperties: Record<string, unknown> = {}
  for (const [name, child] of Object.entries(properties))
    nextProperties[name] = required.has(name) ? child : toNullable(child)

  normalized.properties = nextProperties
  normalized.required = propertyNames
  return normalized
}
