const normalizeStructuredOutputSchema = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeStructuredOutputSchema)
  if (!value || typeof value !== 'object') return value

  const input = value as Record<string, unknown>
  const normalized: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(input)) {
    if (key === 'oneOf')
      normalized.anyOf = normalizeStructuredOutputSchema(child)
    else normalized[key] = normalizeStructuredOutputSchema(child)
  }
  return normalized
}

export const parseStructuredOutputJson = (output: string): unknown => {
  const trimmed = output.trim()
  if (!trimmed) throw new Error('responses_structured_output_empty')
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    throw new Error('responses_structured_output_invalid_json')
  }
}

export const buildStructuredOutputTextFormat = (
  outputSchema?: unknown,
): { format: unknown } | undefined =>
  outputSchema
    ? {
        format: normalizeStructuredOutputSchema(outputSchema),
      }
    : undefined
