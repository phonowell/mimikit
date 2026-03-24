import { join } from 'node:path'

import { tokenizeSearchTextWithCjkFallback } from '../../foundation/shared/text-search.js'
import { truncateText } from '../../foundation/shared/text.js'
import { parseIsoToMs } from '../../foundation/shared/time.js'
import { listFiles } from '../fs/paths.js'
import { readTextFile } from '../fs/read-text.js'

import { parseTaskResultSearchSource } from './task-results-parse.js'

import type {
  TaskArchiveLookupMessage,
  TaskResultStatus,
} from '../../foundation/types/index.js'

export type QueryTaskResultArchivesOptions = {
  limit?: number
  maxFiles?: number
}

type SearchDoc = {
  taskId: string
  status: TaskResultStatus
  completedAt: string
  archivePath: string
  title?: string
  snippet: string
  tokens: string[]
  tokenFreq: Map<string, number>
}

const MAX_DOC_SNIPPET_CHARS = 400
const BM25_K1 = 1.2
const BM25_B = 0.75

const sortedDirNames = (names: string[]): string[] =>
  [...names].sort().reverse()

const buildTokenFreq = (tokens: string[]): Map<string, number> => {
  const map = new Map<string, number>()
  for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1)
  return map
}

const truncateSnippet = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return truncateText(normalized, MAX_DOC_SNIPPET_CHARS, { suffix: '…' })
}

const toSearchDoc = async (path: string): Promise<SearchDoc | undefined> => {
  const content = await readTextFile(path)
  if (!content) return undefined
  const parsed = parseTaskResultSearchSource(content, path)
  if (!parsed) return undefined
  const snippet = truncateSnippet(parsed.output)
  const indexText = [parsed.title ?? '', parsed.prompt, parsed.output].join(
    '\n',
  )
  const tokens = tokenizeSearchTextWithCjkFallback(indexText)
  return {
    taskId: parsed.taskId,
    status: parsed.status,
    completedAt: parsed.completedAt,
    archivePath: parsed.archivePath,
    ...(parsed.title ? { title: parsed.title } : {}),
    snippet,
    tokens,
    tokenFreq: buildTokenFreq(tokens),
  }
}

const sortSearchHits = (
  hits: TaskArchiveLookupMessage[],
): TaskArchiveLookupMessage[] =>
  [...hits].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    const timeDiff = parseIsoToMs(b.completedAt) - parseIsoToMs(a.completedAt)
    if (timeDiff !== 0) return timeDiff
    return a.taskId.localeCompare(b.taskId)
  })

const buildPhraseBoost = (queryText: string, doc: SearchDoc): number => {
  const phrase = queryText.trim().toLowerCase()
  if (!phrase) return 0
  const haystack = [doc.title ?? '', doc.snippet].join('\n').toLowerCase()
  return haystack.includes(phrase) ? 0.8 : 0
}

const scoreDocByBm25 = (params: {
  doc: SearchDoc
  queryTokens: string[]
  avgDocLength: number
  docCount: number
  docFreqByToken: Map<string, number>
}): number => {
  const { doc, queryTokens, avgDocLength, docCount, docFreqByToken } = params
  if (queryTokens.length === 0 || doc.tokens.length === 0) return 0
  const docLength = doc.tokens.length
  let score = 0
  for (const token of queryTokens) {
    const tf = doc.tokenFreq.get(token) ?? 0
    if (tf <= 0) continue
    const docFreq = docFreqByToken.get(token) ?? 0
    const idf = Math.log(1 + (docCount - docFreq + 0.5) / (docFreq + 0.5))
    const denominator =
      tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLength / avgDocLength))
    score += idf * ((tf * (BM25_K1 + 1)) / denominator)
  }
  return score
}

export const queryTaskResultArchives = async (
  stateDir: string,
  query: string,
  options: QueryTaskResultArchivesOptions = {},
): Promise<TaskArchiveLookupMessage[]> => {
  const queryText = query.trim()
  if (!queryText) return []
  const limit = Math.max(1, options.limit ?? 6)
  const maxFiles = Math.max(limit, options.maxFiles ?? 240)
  const archiveRoot = join(stateDir, 'tasks')
  const allDateDirs = sortedDirNames(
    (await listFiles(archiveRoot))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )
  const docs: SearchDoc[] = []
  for (const dateDir of allDateDirs) {
    if (docs.length >= maxFiles) break
    const entries = await listFiles(join(archiveRoot, dateDir))
    for (const entry of entries) {
      if (docs.length >= maxFiles) break
      if (!entry.isFile()) continue
      const doc = await toSearchDoc(join(archiveRoot, dateDir, entry.name))
      if (!doc) continue
      docs.push(doc)
    }
  }
  if (docs.length === 0) return []

  const queryTokens = tokenizeSearchTextWithCjkFallback(queryText)
  if (queryTokens.length === 0) return []
  const avgDocLength = Math.max(
    1,
    docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / docs.length,
  )
  const docFreqByToken = new Map<string, number>()
  for (const token of queryTokens) {
    let freq = 0
    for (const doc of docs) if (doc.tokenFreq.has(token)) freq += 1
    docFreqByToken.set(token, freq)
  }
  const hits = docs
    .map((doc) => {
      const score =
        scoreDocByBm25({
          doc,
          queryTokens,
          avgDocLength,
          docCount: docs.length,
          docFreqByToken,
        }) + buildPhraseBoost(queryText, doc)
      if (score <= 0) return null
      return {
        taskId: doc.taskId,
        status: doc.status,
        completedAt: doc.completedAt,
        archivePath: doc.archivePath,
        score: Number(score.toFixed(4)),
        ...(doc.title ? { title: doc.title } : {}),
        ...(doc.snippet ? { snippet: doc.snippet } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return sortSearchHits(hits).slice(0, limit)
}
