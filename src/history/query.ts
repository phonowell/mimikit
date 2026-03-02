import { createRequire } from 'node:module'

import { z } from 'zod'

import {
  normalizeMsRange,
  parseOptionalNumber,
} from '../shared/query-params.js'
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
const ALL_ROLES: Role[] = ['user', 'agent', 'system']
const DEFAULT_ROLES: Role[] = ALL_ROLES
const INTEGER_STRING_RE = /^[+-]?\d+$/

const isRole = (value: string): value is Role =>
  value === 'user' || value === 'agent' || value === 'system'

const normalizeOptionalString = (value: unknown): unknown =>
  typeof value === 'string' && value.trim().length === 0 ? undefined : value

const parseRolesRaw = (raw: string): Role[] | undefined => {
  const unique = new Set<Role>()
  for (const part of raw.split(',')) {
    const role = part.trim()
    if (role === 'all') {
      for (const knownRole of ALL_ROLES) unique.add(knownRole)
      continue
    }
    if (!isRole(role)) return undefined
    unique.add(role)
  }
  return unique.size > 0 ? Array.from(unique) : undefined
}

export const queryHistorySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z
      .string()
      .trim()
      .regex(INTEGER_STRING_RE, 'limit must be an integer string')
      .refine(
        (value) =>
          Number.isSafeInteger(Number(value)) &&
          Number(value) >= MIN_LIMIT &&
          Number(value) <= MAX_LIMIT,
        `limit must be in range [${MIN_LIMIT}, ${MAX_LIMIT}]`,
      )
      .optional(),
    roles: z.preprocess(
      normalizeOptionalString,
      z
        .string()
        .trim()
        .refine(
          (value) => parseRolesRaw(value) !== undefined,
          'roles must be a comma-separated list of user|agent|system|all',
        )
        .optional(),
    ),
    before_id: z.string().trim().min(1).optional(),
    from: z.string().trim().min(1).optional(),
    to: z.string().trim().min(1).optional(),
  })
  .strict()

const parseRoles = (raw?: string): Role[] => {
  if (!raw) return DEFAULT_ROLES
  return parseRolesRaw(raw) ?? DEFAULT_ROLES
}

export const pickQueryHistoryRequest = (
  actions: Parsed[],
): QueryHistoryRequest | undefined => {
  for (const item of actions) {
    if (item.name !== 'query_history') continue
    const parsed = queryHistorySchema.safeParse(item.attrs)
    if (!parsed.success) continue
    const limit = parseOptionalNumber(parsed.data.limit, DEFAULT_LIMIT)
    const fromMs = parsed.data.from ? parseIsoMs(parsed.data.from) : undefined
    const toMs = parsed.data.to ? parseIsoMs(parsed.data.to) : undefined
    const range = normalizeMsRange(fromMs, toMs)
    return {
      query: parsed.data.query,
      limit,
      roles: parseRoles(parsed.data.roles),
      ...(parsed.data.before_id ? { beforeId: parsed.data.before_id } : {}),
      ...range,
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
