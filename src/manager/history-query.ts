import { createRequire } from 'node:module'

import { computeRecencyWeight, parseIsoMs } from '../shared/time.js'

import type { QueryHistoryRequest } from './history-query-request.js'
import type {
  HistoryLookupMessage,
  HistoryMessage,
  Role,
} from '../types/index.js'

export { pickQueryHistoryRequest } from './history-query-request.js'

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
