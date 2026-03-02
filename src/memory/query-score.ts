import { createRequire } from 'node:module'

import { toTokens } from '../history/query-score.js'
import { computeRecencyWeight, parseIsoMs } from '../shared/time.js'

import type {
  MemoryLookupMessage,
  MemorySource,
  ISODate,
} from '../types/index.js'
import type { MemoryRecord } from './store.js'

export type QueryMemoryRequest = {
  query: string
  limit: number
  tags: string[]
  source?: MemorySource
  minScore?: number
  fromMs?: number
  toMs?: number
}

const LOOKUP_MAX_CHARS = 480
const CJK_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu

type MemoryDoc = {
  id: string
  source: MemorySource
  tags: string[]
  score: number
  content: string
  createdAt: ISODate
  ts: number
}

const clip = (value: string): string => {
  if (value.length <= LOOKUP_MAX_CHARS) return value
  return `${value.slice(0, LOOKUP_MAX_CHARS - 3).trimEnd()}...`
}

const toMemoryTokens = (value: string): string[] => {
  const cjkTokens: string[] = []
  for (const run of value.match(CJK_RUN_RE) ?? []) {
    const chars = [...run]
    for (const char of chars) cjkTokens.push(char)
    for (let index = 0; index < chars.length - 1; index++)
      cjkTokens.push(`${chars[index] ?? ''}${chars[index + 1] ?? ''}`)
  }
  return Array.from(new Set([...toTokens(value), ...cjkTokens]))
}

const collectDocs = (
  records: MemoryRecord[],
  request: QueryMemoryRequest,
): MemoryDoc[] => {
  const nowMs = Date.now()
  return records
    .filter((item) => {
      const createdMs = parseIsoMs(item.createdAt)
      const expiresMs = item.expiresAt ? parseIsoMs(item.expiresAt) : undefined
      if (expiresMs !== undefined && expiresMs <= nowMs) return false
      if (request.source && item.source !== request.source) return false
      if (
        request.minScore !== undefined &&
        Number(item.score) < Number(request.minScore)
      )
        return false
      if (request.tags.length > 0) {
        const itemTags = new Set(item.tags.map((tag) => tag.toLowerCase()))
        if (!request.tags.some((tag) => itemTags.has(tag))) return false
      }
      if (request.fromMs !== undefined || request.toMs !== undefined) {
        if (createdMs === undefined) return false
        if (request.fromMs !== undefined && createdMs < request.fromMs) return false
        if (request.toMs !== undefined && createdMs > request.toMs) return false
      }
      return item.content.trim().length > 0
    })
    .map((item) => ({
      id: item.id,
      source: item.source,
      tags: item.tags,
      score: item.score,
      content: item.content.replace(/\s+/g, ' ').trim(),
      createdAt: item.createdAt,
      ts: parseIsoMs(item.createdAt) ?? 0,
    }))
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

export const queryMemoryRecords = (
  records: MemoryRecord[],
  request: QueryMemoryRequest,
): MemoryLookupMessage[] => {
  const docs = collectDocs(records, request)
  if (docs.length === 0) return []
  const engine: FlexIndex = new Index({
    tokenize: 'forward',
    encode: toMemoryTokens,
    cache: false,
  })
  for (const doc of docs)
    engine.add(doc.id, `${doc.content}\n${doc.tags.join(' ')}`)
  const rankedIds = engine.search(request.query, {
    limit: Math.max(request.limit * 4, request.limit),
  })
  if (rankedIds.length === 0) return []
  const docsById = new Map(docs.map((doc) => [doc.id, doc]))
  const newest = Math.max(...docs.map((doc) => doc.ts))
  const oldest = Math.min(...docs.map((doc) => doc.ts))
  const scoreBase = Math.max(1, rankedIds.length)

  return rankedIds
    .map((id, index) => {
      const doc = docsById.get(String(id))
      if (!doc) return undefined
      const baseScore = (scoreBase - index) / scoreBase
      const recency = computeRecencyWeight(doc.ts, oldest, newest)
      const mergedScore = baseScore + recency * 0.05 + doc.score * 0.2
      return {
        id: doc.id,
        source: doc.source,
        tags: doc.tags,
        time: doc.createdAt,
        content: clip(doc.content),
        score: Number(mergedScore.toFixed(4)),
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
