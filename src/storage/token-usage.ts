import { z } from 'zod'

import type { TokenUsage } from '../types/index.js'

export const tokenUsageSchema = z
  .object({
    input: z.number().finite().nonnegative().optional(),
    output: z.number().finite().nonnegative().optional(),
    total: z.number().finite().nonnegative().optional(),
    sessionTotal: z.number().finite().nonnegative().optional(),
    cacheRead: z.number().finite().nonnegative().optional(),
    cacheWrite: z.number().finite().nonnegative().optional(),
  })
  .strict()

type TokenUsageInput = z.infer<typeof tokenUsageSchema>

export const normalizeTokenUsage = (
  usage: TokenUsageInput | null | undefined,
): TokenUsage | undefined => {
  if (!usage) return undefined
  const normalized: TokenUsage = {
    ...(usage.input !== undefined ? { input: usage.input } : {}),
    ...(usage.output !== undefined ? { output: usage.output } : {}),
    ...(usage.total !== undefined ? { total: usage.total } : {}),
    ...(usage.sessionTotal !== undefined
      ? { sessionTotal: usage.sessionTotal }
      : {}),
    ...(usage.cacheRead !== undefined ? { cacheRead: usage.cacheRead } : {}),
    ...(usage.cacheWrite !== undefined ? { cacheWrite: usage.cacheWrite } : {}),
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
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
