import { normalizeStrictOutputSchema } from '../../foundation/shared/strict-output-schema.js'

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
        format: normalizeStrictOutputSchema(outputSchema),
      }
    : undefined
