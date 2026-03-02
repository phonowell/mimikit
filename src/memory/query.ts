import { z } from 'zod'

import { parseIsoMs } from '../shared/time.js'

import { queryMemoryRecords } from './query-score.js'

import type { Parsed } from '../actions/model/spec.js'
import type { MemoryRecord } from './store.js'
import type { QueryMemoryRequest } from './query-score.js'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10
const MIN_LIMIT = 1
const INTEGER_STRING_RE = /^[+-]?\d+$/
const DECIMAL_STRING_RE = /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/

const memorySourceSchema = z.enum(['user', 'agent', 'system'])

const parseTagList = (raw: string): string[] => {
  const unique = new Set<string>()
  for (const part of raw.split(',')) {
    const tag = part.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!tag) continue
    unique.add(tag)
  }
  return Array.from(unique)
}

export const queryMemorySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z
      .string()
      .trim()
      .regex(INTEGER_STRING_RE, 'limit must be an integer string')
      .refine((value) => {
        const parsed = Number(value)
        return (
          Number.isSafeInteger(parsed) &&
          parsed >= MIN_LIMIT &&
          parsed <= MAX_LIMIT
        )
      }, `limit must be in range [${MIN_LIMIT}, ${MAX_LIMIT}]`)
      .optional(),
    tags: z
      .string()
      .trim()
      .refine((value) => parseTagList(value).length > 0, 'tags must not be empty')
      .optional(),
    source: memorySourceSchema.optional(),
    min_score: z
      .string()
      .trim()
      .regex(DECIMAL_STRING_RE, 'min_score must be in range [0, 1]')
      .optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
  })
  .strict()

const parseLimit = (raw?: string): number => (raw ? Number(raw) : DEFAULT_LIMIT)

export const pickQueryMemoryRequest = (
  actions: Parsed[],
): QueryMemoryRequest | undefined => {
  for (const item of actions) {
    if (item.name !== 'query_memory') continue
    const parsed = queryMemorySchema.safeParse(item.attrs)
    if (!parsed.success) continue
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
      limit: parseLimit(parsed.data.limit),
      tags: parseTagList(parsed.data.tags ?? ''),
      ...(parsed.data.source ? { source: parsed.data.source } : {}),
      ...(parsed.data.min_score ? { minScore: Number(parsed.data.min_score) } : {}),
      ...(rangeStart !== undefined ? { fromMs: rangeStart } : {}),
      ...(rangeEnd !== undefined ? { toMs: rangeEnd } : {}),
    }
  }
  return undefined
}

export const queryMemory = (
  records: MemoryRecord[],
  request: QueryMemoryRequest,
) => queryMemoryRecords(records, request)

export type { QueryMemoryRequest } from './query-score.js'
