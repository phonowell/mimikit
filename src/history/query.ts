import { createRequire } from 'node:module'

import { z } from 'zod'

import { parseIsoMs } from '../shared/time.js'

import { collectDocs, scoreAndRankDocs, toTokens } from './query-score.js'

import type { QueryHistoryRequest } from './query-score.js'
import type { Parsed } from '../actions/model/spec.js'
import type {
  HistoryLookupMessage,
  HistoryMessage,
  Role,
} from '../types/index.js'

export type { QueryHistoryRequest } from './query-score.js'

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 20
const MIN_LIMIT = 1
const DEFAULT_ROLES: Role[] = ['user', 'agent']
const DECIMAL_PREFIX_RE = /^[+-]?\d+/

export const queryHistorySchema = z
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
  const decimalPrefix = raw.match(DECIMAL_PREFIX_RE)?.[0]
  if (!decimalPrefix) return DEFAULT_LIMIT
  const parsed = Number(decimalPrefix)
  if (!Number.isFinite(parsed) || parsed === 0) return DEFAULT_LIMIT
  const normalized = Math.trunc(parsed)
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, normalized))
}

const isRole = (value: string): value is Role =>
  value === 'user' || value === 'agent' || value === 'system'

const parseRoles = (raw?: string): Role[] => {
  if (!raw) return DEFAULT_ROLES
  const unique = new Set<Role>()
  for (const part of raw.split(',')) {
    const role = part.trim()
    if (isRole(role)) unique.add(role)
  }
  return unique.size > 0 ? Array.from(unique) : DEFAULT_ROLES
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

const require = createRequire(import.meta.url)

type FlexIndex = {
  add: (id: string, content: string) => void
  search: (query: string, options: { limit: number }) => Array<string | number>
}

type FlexModule = {
  Index: new (options: {
    tokenize: string
    encode: (value: string) => string[]
    cache: boolean
  }) => FlexIndex
}

const { Index } = require('flexsearch') as FlexModule

export const queryHistory = (
  history: HistoryMessage[],
  request: QueryHistoryRequest,
): HistoryLookupMessage[] => {
  const docs = collectDocs(history, request)
  if (docs.length === 0) return []
  const engine: FlexIndex = new Index({
    tokenize: 'forward',
    encode: toTokens,
    cache: false,
  })
  for (const doc of docs) engine.add(doc.id, doc.text)
  const rankedIds = engine.search(request.query, {
    limit: Math.max(request.limit * 4, request.limit),
  })
  if (rankedIds.length === 0) return []
  return scoreAndRankDocs(docs, rankedIds, request.limit)
}
