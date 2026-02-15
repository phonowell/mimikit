import bm25 from 'wink-bm25-text-search'
import { z } from 'zod'

import type { Parsed } from '../actions/model/spec.js'
import type {
  HistoryLookupMessage,
  HistoryMessage,
  Role,
} from '../types/index.js'

const DEFAULT_LIMIT = 6
const MAX_LIMIT = 20
const MIN_LIMIT = 1
const LOOKUP_MAX_CHARS = 480

type QueryHistoryRequest = {
  query: string
  limit: number
  roles: Role[]
  beforeId?: string
}

const queryHistorySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.string().trim().optional(),
    roles: z.string().trim().optional(),
    before_id: z.string().trim().min(1).optional(),
  })
  .strict()

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

const parseIsoMs = (value: string): number => {
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : 0
}

const beforeIndex = (
  history: HistoryMessage[],
  beforeId?: string,
): number | undefined => {
  if (!beforeId) return undefined
  const index = history.findIndex((item) => item.id === beforeId)
  return index >= 0 ? index : undefined
}

export const pickQueryHistoryRequest = (
  actions: Parsed[],
): QueryHistoryRequest | undefined => {
  for (const item of actions) {
    if (item.name !== 'query_history') continue
    const parsed = queryHistorySchema.safeParse(item.attrs)
    if (!parsed.success) continue
    const limit = parseLimit(parsed.data.limit)
    return {
      query: parsed.data.query,
      limit,
      roles: parseRoles(parsed.data.roles),
      ...(parsed.data.before_id ? { beforeId: parsed.data.before_id } : {}),
    }
  }
  return undefined
}

type QueryDoc = {
  id: string
  role: Role
  createdAt: string
  text: string
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
    const text = normalizeSpace(item.text)
    if (!text) continue
    docs.push({
      id: item.id,
      role: item.role,
      createdAt: item.createdAt,
      text,
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

export const queryHistory = (
  history: HistoryMessage[],
  request: QueryHistoryRequest,
): HistoryLookupMessage[] => {
  const docs = collectDocs(history, request)
  if (docs.length === 0) return []
  const docsById = new Map(docs.map((doc) => [doc.id, doc]))
  const newest = Math.max(...docs.map((doc) => parseIsoMs(doc.createdAt)))
  const oldest = Math.min(...docs.map((doc) => parseIsoMs(doc.createdAt)))
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

  const ranked = raw
    .map(([docId, score]) => {
      const doc = docsById.get(String(docId))
      if (!doc) return undefined
      const ts = parseIsoMs(doc.createdAt)
      const recency =
        newest <= oldest ? 1 : Math.max(0, (ts - oldest) / (newest - oldest))
      const weightedScore = score + recency * 0.05
      return { doc, score: weightedScore, ts }
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      if (a.ts !== b.ts) return b.ts - a.ts
      return a.doc.id.localeCompare(b.doc.id)
    })

  return ranked.slice(0, request.limit).map((item) => ({
    id: item.doc.id,
    role: item.doc.role,
    time: item.doc.createdAt,
    content: clip(item.doc.text, LOOKUP_MAX_CHARS),
    score: Number(item.score.toFixed(4)),
  }))
}
