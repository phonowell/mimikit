import { z } from 'zod'

import type { TokenUsage } from '../types/index.js'

export const tokenUsageSchema = z
  .object({
    input: z.number().finite().nonnegative().optional(),
    inputCacheRead: z.number().finite().nonnegative().optional(),
    inputCacheWrite: z.number().finite().nonnegative().optional(),
    output: z.number().finite().nonnegative().optional(),
    outputCache: z.number().finite().nonnegative().optional(),
    total: z.number().finite().nonnegative().optional(),
    sessionTotal: z.number().finite().nonnegative().optional(),
  })
  .strict()

type TokenUsageInput = z.infer<typeof tokenUsageSchema>

const USAGE_KEYS = [
  'input', 'inputCacheRead', 'inputCacheWrite',
  'output', 'outputCache', 'total', 'sessionTotal',
] as const

export const normalizeTokenUsage = (
  usage: TokenUsageInput | null | undefined,
): TokenUsage | undefined => {
  if (!usage) return undefined
  const result: TokenUsage = {}
  for (const key of USAGE_KEYS) {
    if (usage[key] !== undefined) result[key] = usage[key]
  }
  return Object.keys(result).length > 0 ? result : undefined
}

export const parseTokenUsageJson = (raw?: string): TokenUsage | undefined => {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as unknown
    const validated = tokenUsageSchema.safeParse(parsed)
    if (!validated.success) return undefined
    return normalizeTokenUsage(validated.data)
  } catch {
    return undefined
  }
}
