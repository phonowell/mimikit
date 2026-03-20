import { join } from 'node:path'

import { listFiles } from '../fs/paths.js'
import { readTextFile } from '../fs/read-text.js'
import { safe } from '../log/safe.js'
import { tokenizeSearchTextWithCjkFallback } from '../shared/text-search.js'
import { truncateText } from '../shared/text.js'
import { parseIsoToMs } from '../shared/time.js'
import {
  parseTaskCancelSource,
  parseTaskResultOutcome,
  parseTaskResultStatus,
  parseTaskResultStopReason,
  parseTaskStatus,
  parseWorkerProvider,
} from '../types/runtime-domain.js'

import {
  extractArchiveSection,
  parseArchiveDocument,
} from './archive-format.js'
import {
  taskEvidenceSchema,
  taskResultHandoffSchema,
} from './runtime-snapshot-schema.js'
import { parseTokenUsageJson } from './token-usage.js'

import type {
  TaskArchiveLookupMessage,
  TaskCancelMeta,
  TaskResult,
  TaskResultHandoff,
  TaskResultStatus,
} from '../types/index.js'
import type { z } from 'zod'

const parseStatus = (value?: string): TaskResultStatus | null =>
  parseTaskResultStatus(value) ?? null

const parseCancelSource = (
  value?: string,
): TaskCancelMeta['source'] | undefined => {
  const normalized = value === 'http' ? 'user' : value
  return parseTaskCancelSource(normalized)
}

const parseArchiveJsonObject = <T extends Record<string, unknown>>(
  raw: string | undefined,
  schema: z.ZodType<T>,
): T | undefined => {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  const result = schema.safeParse(parsed)
  if (!result.success) return undefined
  return Object.keys(result.data).length > 0 ? result.data : undefined
}

const parseTaskResultHandoff = (raw?: string): TaskResultHandoff | undefined =>
  parseArchiveJsonObject(raw, taskResultHandoffSchema)

const parseTaskEvidence = (raw?: string): TaskResult['evidence'] | undefined =>
  parseArchiveJsonObject(raw, taskEvidenceSchema)

const parseTaskResultArchive = (
  content: string,
  archivePath?: string,
): TaskResult | null => {
  const parsed = parseArchiveDocument(content)
  const taskId = parsed.header.task_id
  const status = parseStatus(parsed.header.status)
  const completedAt = parsed.header.completed_at ?? parsed.header.created_at
  if (!taskId || !status || !completedAt) return null

  const durationMs = Number(parsed.header.duration_ms)
  const usage = parseTokenUsageJson(parsed.header.usage)
  const provider = parseWorkerProvider(parsed.header.provider)
  const taskStatus = parseTaskStatus(parsed.header.task_status)
  const outcome = parseTaskResultOutcome(parsed.header.outcome)
  const stopReason = parseTaskResultStopReason(parsed.header.stop_reason)
  const cancelSource = parseCancelSource(parsed.header.cancel_source)
  const cancel: TaskCancelMeta | undefined = cancelSource
    ? {
        source: cancelSource,
        ...(parsed.header.cancel_reason
          ? { reason: parsed.header.cancel_reason }
          : {}),
      }
    : undefined
  const handoff = parseTaskResultHandoff(parsed.header.handoff)
  const evidence = parseTaskEvidence(parsed.header.evidence)

  return {
    taskId,
    status,
    ok: status === 'succeeded',
    output: extractArchiveSection(parsed, '=== RESULT ==='),
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    completedAt,
    ...(taskStatus ? { taskStatus } : {}),
    ...(outcome ? { outcome } : {}),
    ...(stopReason ? { stopReason } : {}),
    ...(usage ? { usage } : {}),
    ...(provider ? { provider } : {}),
    ...(parsed.header.title ? { title: parsed.header.title } : {}),
    ...(archivePath ? { archivePath } : {}),
    ...(cancel ? { cancel } : {}),
    ...(handoff ? { handoff } : {}),
    ...(evidence ? { evidence } : {}),
  }
}

export const readTaskResultArchive = (
  path: string,
): Promise<TaskResult | null> =>
  safe(
    'readTaskResultArchive',
    async () => {
      const content = await readTextFile(path)
      if (!content) return null
      return parseTaskResultArchive(content, path)
    },
    { fallback: null, meta: { path }, ignoreCodes: ['ENOENT'] },
  )

export type ReadTaskResultsOptions = {
  maxFiles?: number
  dateHints?: Record<string, string>
}

export type QueryTaskResultArchivesOptions = {
  limit?: number
  maxFiles?: number
}

const compareTaskResultRecency = (
  left: TaskResult,
  right: TaskResult,
): number => {
  const timeDiff =
    parseIsoToMs(right.completedAt) - parseIsoToMs(left.completedAt)
  if (timeDiff !== 0) return timeDiff
  return (right.archivePath ?? '').localeCompare(left.archivePath ?? '')
}

const sortedDirNames = (names: string[]): string[] =>
  [...names].sort().reverse()

const resolveDateDirs = (
  taskIds: string[],
  allDirs: string[],
  dateHints?: Record<string, string>,
): string[] => {
  if (!dateHints) return allDirs
  const hinted = new Set<string>()
  let missingHint = false
  for (const id of taskIds) {
    const hint = dateHints[id]
    if (!hint) {
      missingHint = true
      break
    }
    hinted.add(hint)
  }
  return missingHint ? allDirs : sortedDirNames(Array.from(hinted))
}

export const readTaskResultsForTasks = async (
  stateDir: string,
  taskIds: string[],
  options: ReadTaskResultsOptions = {},
): Promise<TaskResult[]> => {
  const ids = taskIds.map((id) => id.trim()).filter(Boolean)
  const idSet = new Set(ids)
  if (idSet.size === 0) return []

  const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY
  const resultLimit = Math.min(idSet.size, maxFiles)
  const found = new Map<string, TaskResult>()
  const archiveRoot = join(stateDir, 'tasks')
  const allDateDirs = sortedDirNames(
    (await listFiles(archiveRoot))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )

  for (const dateDir of resolveDateDirs(ids, allDateDirs, options.dateHints)) {
    if (found.size >= resultLimit) break
    const entries = await listFiles(join(archiveRoot, dateDir))
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const underscore = entry.name.indexOf('_')
      if (underscore <= 0) continue
      const taskId = entry.name.slice(0, underscore)
      if (!idSet.has(taskId)) continue
      const result = await readTaskResultArchive(
        join(archiveRoot, dateDir, entry.name),
      )
      if (!result) continue
      const existing = found.get(taskId)
      if (!existing || compareTaskResultRecency(result, existing) < 0)
        found.set(taskId, result)
    }
  }

  return Array.from(found.values())
    .sort(compareTaskResultRecency)
    .slice(0, resultLimit)
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
  const parsed = parseArchiveDocument(content)
  const taskId = parsed.header.task_id?.trim()
  const status = parseStatus(parsed.header.status)
  const completedAt =
    parsed.header.completed_at?.trim() ?? parsed.header.created_at?.trim()
  if (!taskId || !status || !completedAt) return undefined
  const title = parsed.header.title?.trim()
  const prompt = extractArchiveSection(parsed, '=== PROMPT ===')
  const output = extractArchiveSection(parsed, '=== RESULT ===')
  const snippet = truncateSnippet(output)
  const indexText = [title ?? '', prompt, output].join('\n')
  const tokens = tokenizeSearchTextWithCjkFallback(indexText)
  return {
    taskId,
    status,
    completedAt,
    archivePath: path,
    ...(title ? { title } : {}),
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
