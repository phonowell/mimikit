import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'
import type { Role } from '../types/index.js'

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 20
const MIN_LIMIT = 1

export type QueryHistoryRequest = {
  query: string
  limit: number
  roles: Role[]
  beforeId?: string
  fromMs?: number
  toMs?: number
}

const queryHistorySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.string().trim().optional(),
    roles: z.string().trim().optional(),
    before_id: z.string().trim().min(1).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
  })
  .strict()

const parseLimit = (raw?: string): number => {
  if (!raw) return DEFAULT_LIMIT
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) return DEFAULT_LIMIT
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, value))
}

const isRole = (value: string): value is Role =>
  value === 'user' || value === 'assistant' || value === 'system'

const parseRoles = (raw?: string): Role[] => {
  if (!raw) return ['user', 'assistant']
  const unique = new Set<Role>()
  for (const part of raw.split(',')) {
    const role = part.trim()
    if (!isRole(role)) continue
    unique.add(role)
  }
  return unique.size > 0 ? Array.from(unique) : ['user', 'assistant']
}

export const parseIsoMs = (value: string): number | undefined => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : undefined
}

export const pickQueryHistoryRequest = (
  actions: Parsed[],
): QueryHistoryRequest | undefined => {
  for (const item of actions) {
    if (item.name !== 'query_history') continue
    const parsed = queryHistorySchema.safeParse(item.attrs)
    if (!parsed.success) continue
    const limit = parseLimit(parsed.data.limit)
    const fromMs = parsed.data.from ? parseIsoMs(parsed.data.from) : undefined
    const toMs = parsed.data.to ? parseIsoMs(parsed.data.to) : undefined
    const rangeStart =
      fromMs !== undefined && toMs !== undefined
        ? Math.min(fromMs, toMs)
        : fromMs
    const rangeEnd =
      fromMs !== undefined && toMs !== undefined ? Math.max(fromMs, toMs) : toMs
    return {
      query: parsed.data.query,
      limit,
      roles: parseRoles(parsed.data.roles),
      ...(parsed.data.before_id ? { beforeId: parsed.data.before_id } : {}),
      ...(rangeStart !== undefined ? { fromMs: rangeStart } : {}),
      ...(rangeEnd !== undefined ? { toMs: rangeEnd } : {}),
    }
  }
  return undefined
}
