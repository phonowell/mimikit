import { createRequire } from 'node:module'

import { z } from 'zod'

import { isVisibleToAgent } from '../shared/message-visibility.js'
import { computeRecencyWeight, parseIsoMs } from '../shared/time.js'

import type { Parsed } from '../actions/model/spec.js'
import type {
  HistoryLookupMessage,
  HistoryMessage,
  Role,
} from '../types/index.js'

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 20
const MIN_LIMIT = 1
const DEFAULT_ROLES: Role[] = ['user', 'agent']

export type QueryHistoryRequest = {
  query: string
  limit: number
  roles: Role[]
  beforeId?: string
  fromMs?: number
  toMs?: number
}

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

const parseLimit = (raw?: string): number =>
  Math.max(
    MIN_LIMIT,
    Math.min(MAX_LIMIT, Number.parseInt(raw ?? '', 10) || DEFAULT_LIMIT),
  )

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

const LOOKUP_MAX_CHARS = 480
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

type QueryDoc = {
  id: string
  role: Role
  createdAt: string
  text: string
  ts: number
}

const normalizeSpace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim()

const clip = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value
  const suffix = '...'
  return `${value.slice(0, Math.max(0, maxChars - suffix.length)).trimEnd()}${suffix}`
}

const toTokens = (value: string): string[] =>
  normalizeSpace(value)
    .toLowerCase()
    .match(/[\p{L}\p{N}_-]+/gu) ?? []

const collectDocs = (
  history: HistoryMessage[],
  request: QueryHistoryRequest,
): QueryDoc[] => {
  const beforeIndex = request.beforeId
    ? history.findIndex((item) => item.id === request.beforeId)
    : -1
  const source = beforeIndex >= 0 ? history.slice(0, beforeIndex) : history
  const allowed = new Set(request.roles)
  const docs: QueryDoc[] = []
  for (const item of source) {
    if (!isVisibleToAgent(item)) continue
    if (!allowed.has(item.role)) continue
    const parsedTime = parseIsoMs(item.createdAt)
    if (request.fromMs !== undefined || request.toMs !== undefined) {
      if (parsedTime === undefined) continue
      if (request.fromMs !== undefined && parsedTime < request.fromMs) continue
      if (request.toMs !== undefined && parsedTime > request.toMs) continue
    }
    const text = normalizeSpace(item.text)
    if (!text) continue
    docs.push({
      id: item.id,
      role: item.role,
      createdAt: item.createdAt,
      text,
      ts: parsedTime ?? 0,
    })
  }
  return docs
}

export const queryHistory = (
  history: HistoryMessage[],
  request: QueryHistoryRequest,
): HistoryLookupMessage[] => {
  const docs = collectDocs(history, request)
  if (docs.length === 0) return []
  const docsById = new Map(docs.map((doc) => [doc.id, doc]))
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

  const newest = Math.max(...docs.map((doc) => doc.ts))
  const oldest = Math.min(...docs.map((doc) => doc.ts))
  const scoreBase = Math.max(1, rankedIds.length)

  return rankedIds
    .map((id, index) => {
      const doc = docsById.get(String(id))
      if (!doc) return undefined
      const baseScore = (scoreBase - index) / scoreBase
      const recency = computeRecencyWeight(doc.ts, oldest, newest)
      return {
        id: doc.id,
        role: doc.role,
        time: doc.createdAt,
        content: clip(doc.text, LOOKUP_MAX_CHARS),
        score: Number((baseScore + recency * 0.05).toFixed(4)),
        ts: doc.ts,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      if (a.ts !== b.ts) return b.ts - a.ts
      return a.id.localeCompare(b.id)
    })
    .slice(0, request.limit)
    .map(({ ts: _ts, ...item }) => item)
}
