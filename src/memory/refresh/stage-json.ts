import type { z } from 'zod'

const stripCodeFence = (text: string): string => {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (!fenced) return trimmed
  return fenced[1]?.trim() ?? ''
}

const pickJsonObject = (text: string): string => {
  const normalized = stripCodeFence(text)
  const start = normalized.indexOf('{')
  const end = normalized.lastIndexOf('}')
  if (start < 0 || end < start) return normalized
  return normalized.slice(start, end + 1)
}

export const parseStageJson = <TSchema extends z.ZodTypeAny>(
  output: string,
  schema: TSchema,
  stage: string,
): z.infer<TSchema> => {
  const payload = pickJsonObject(output)
  let parsedRaw: unknown
  try {
    parsedRaw = JSON.parse(payload)
  } catch {
    throw new Error(`memory_refresh_${stage}_invalid_json`)
  }
  const parsed = schema.safeParse(parsedRaw)
  if (!parsed.success) throw new Error(`memory_refresh_${stage}_invalid_schema`)
  return parsed.data
}
