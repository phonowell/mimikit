import bm25 from 'wink-bm25-text-search'

import { computeRecencyWeight, parseIsoMs } from '../shared/time.js'

import type { QueryHistoryRequest } from './history-query-request.js'
import type {
  HistoryLookupMessage,
  HistoryMessage,
  Role,
} from '../types/index.js'

export { pickQueryHistoryRequest } from './history-query-request.js'

const LOOKUP_MAX_CHARS = 480

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

const beforeIndex = (
  history: HistoryMessage[],
  beforeId?: string,
): number | undefined => {
  if (!beforeId) return undefined
  const index = history.findIndex((item) => item.id === beforeId)
  return index >= 0 ? index : undefined
}

type QueryDoc = {
  id: string
  role: Role
  createdAt: string
  text: string
  ts: number
}

const collectDocs = (
  history: HistoryMessage[],
  request: QueryHistoryRequest,
): QueryDoc[] => {
  const to = beforeIndex(history, request.beforeId)
  const source = to === undefined ? history : history.slice(0, to)
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

const createEngine = (docs: QueryDoc[]) => {
  const engine = bm25()
  engine.defineConfig({
    fldWeights: { text: 1 },
    ovFldNames: ['id', 'role', 'createdAt'],
  })
  engine.definePrepTasks([toTokens])
  for (const doc of docs) engine.addDoc(doc, doc.id)
  engine.consolidate()
  return engine
}

const sortRanked = (
  items: Array<{ doc: QueryDoc; score: number; ts: number }>,
): Array<{ doc: QueryDoc; score: number; ts: number }> =>
  items.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    if (a.ts !== b.ts) return b.ts - a.ts
    return a.doc.id.localeCompare(b.doc.id)
  })

const fallbackSearch = (
  docs: QueryDoc[],
  request: QueryHistoryRequest,
): Array<{ doc: QueryDoc; score: number; ts: number }> => {
  const queryTokens = new Set(toTokens(request.query))
  const newest = Math.max(...docs.map((doc) => doc.ts))
  const oldest = Math.min(...docs.map((doc) => doc.ts))
  return sortRanked(
    docs.map((doc) => {
      const hits = toTokens(doc.text).filter((token) =>
        queryTokens.has(token),
      ).length
      const recency = computeRecencyWeight(doc.ts, oldest, newest)
      return { doc, score: hits + recency * 0.05, ts: doc.ts }
    }),
  )
}

export const queryHistory = (
  history: HistoryMessage[],
  request: QueryHistoryRequest,
): HistoryLookupMessage[] => {
  const docs = collectDocs(history, request)
  if (docs.length === 0) return []
  const docsById = new Map(docs.map((doc) => [doc.id, doc]))
  if (docs.length < 4) {
    return fallbackSearch(docs, request)
      .slice(0, request.limit)
      .map((item) => ({
        id: item.doc.id,
        role: item.doc.role,
        time: item.doc.createdAt,
        content: clip(item.doc.text, LOOKUP_MAX_CHARS),
        score: Number(item.score.toFixed(4)),
      }))
  }
  const newest = Math.max(...docs.map((doc) => doc.ts))
  const oldest = Math.min(...docs.map((doc) => doc.ts))
  const searchLimit = Math.max(request.limit * 4, request.limit)
  const engine = createEngine(docs)
  const raw = engine.search(
    request.query,
    searchLimit,
    (doc, params: { roles: Set<Role> }) => {
      const { role } = doc
      return typeof role === 'string' && params.roles.has(role as Role)
    },
    { roles: new Set(request.roles) },
  )

  const ranked = sortRanked(
    raw
      .map(([docId, score]) => {
        const doc = docsById.get(String(docId))
        if (!doc) return undefined
        const recency = computeRecencyWeight(doc.ts, oldest, newest)
        const weightedScore = score + recency * 0.05
        return { doc, score: weightedScore, ts: doc.ts }
      })
      .filter((item): item is NonNullable<typeof item> => item !== undefined),
  )

  return ranked.slice(0, request.limit).map((item) => ({
    id: item.doc.id,
    role: item.doc.role,
    time: item.doc.createdAt,
    content: clip(item.doc.text, LOOKUP_MAX_CHARS),
    score: Number(item.score.toFixed(4)),
  }))
}
