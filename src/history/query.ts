import { createRequire } from 'node:module'

import { scoreTokenOverlap } from '../shared/text-search.js'

import { collectDocs, scoreAndRankDocs, toTokens } from './query-score.js'

import type { QueryHistoryRequest } from './query-score.js'
import type { HistoryLookupMessage, HistoryMessage } from '../types/index.js'

export type { QueryHistoryRequest } from './query-score.js'

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

const searchWithTokenFallback = (
  engine: FlexIndex,
  query: string,
  limit: number,
): Array<string | number> => {
  const direct = engine.search(query, { limit })
  if (direct.length > 0) return direct
  const tokenQuery = toTokens(query).join(' ')
  if (!tokenQuery) return direct
  return engine.search(tokenQuery, { limit })
}

const rankByTokenOverlap = (
  docs: ReturnType<typeof collectDocs>,
  query: string,
  limit: number,
): Array<string | number> => {
  const queryTokens = toTokens(query)
  if (queryTokens.length === 0) return []
  return docs
    .map((doc) => ({
      id: doc.id,
      score: scoreTokenOverlap(queryTokens, toTokens(doc.text)),
      ts: doc.ts,
    }))
    .filter((row) => row.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score
      if (left.ts !== right.ts) return right.ts - left.ts
      return left.id.localeCompare(right.id)
    })
    .slice(0, limit)
    .map((row) => row.id)
}

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
  const searchLimit = Math.max(request.limit * 4, request.limit)
  const rankedIds = searchWithTokenFallback(engine, request.query, searchLimit)
  const fallbackIds =
    rankedIds.length > 0
      ? rankedIds
      : rankByTokenOverlap(docs, request.query, searchLimit)
  if (fallbackIds.length === 0) return []
  return scoreAndRankDocs(docs, fallbackIds, request.limit)
}
