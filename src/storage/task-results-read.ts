import { join } from 'node:path'

import { listFiles } from '../fs/paths.js'
import { readTextFile } from '../fs/read-text.js'
import { safe } from '../log/safe.js'
import { parseIsoToMs } from '../shared/time.js'

import {
  extractArchiveSection,
  parseArchiveDocument,
} from './archive-format.js'
import { parseTokenUsageJson } from './token-usage.js'

import type {
  TaskArchiveLookupMessage,
  TaskCancelMeta,
  TaskResult,
  TaskResultHandoff,
  TaskResultStatus,
} from '../types/index.js'

const parseStatus = (value?: string): TaskResultStatus | null =>
  value === 'succeeded' || value === 'failed' || value === 'canceled'
    ? value
    : null

const parseCancelSource = (
  value?: string,
): TaskCancelMeta['source'] | undefined => {
  if (value === 'user' || value === 'http') return 'user'
  if (value === 'deferred') return 'deferred'
  if (value === 'system') return 'system'
  return undefined
}

const parseStringList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
  return items.length > 0 ? items : undefined
}

const parseHandoffArtifactList = (
  value: unknown,
): TaskResultHandoff['artifacts'] | undefined => {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined
      const path = typeof item.path === 'string' ? item.path.trim() : ''
      if (!path) return undefined
      const kind = typeof item.kind === 'string' ? item.kind.trim() : ''
      const note = typeof item.note === 'string' ? item.note.trim() : ''
      return {
        path,
        ...(kind ? { kind } : {}),
        ...(note ? { note } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return items.length > 0 ? items : undefined
}

type TaskResultHandoffEvidenceType = NonNullable<
  TaskResultHandoff['evidence']
>[number]['type']

const parseHandoffEvidenceType = (
  value: unknown,
): TaskResultHandoffEvidenceType | undefined =>
  value === 'task_archive' || value === 'file' || value === 'history'
    ? value
    : undefined

const parseHandoffEvidenceList = (
  value: unknown,
): TaskResultHandoff['evidence'] | undefined => {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined
      const type = parseHandoffEvidenceType(item.type)
      const ref = typeof item.ref === 'string' ? item.ref.trim() : ''
      if (!type || !ref) return undefined
      const note = typeof item.note === 'string' ? item.note.trim() : ''
      return {
        type,
        ref,
        ...(note ? { note } : {}),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return items.length > 0 ? items : undefined
}

const parseTaskResultHandoff = (
  raw?: string,
): TaskResultHandoff | undefined => {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const data = parsed as Record<string, unknown>
  const goal = typeof data.goal === 'string' ? data.goal.trim() : ''
  const summary = typeof data.summary === 'string' ? data.summary.trim() : ''
  const decisions = parseStringList(data.decisions)
  const nextSteps = parseStringList(data.nextSteps)
  const risks = parseStringList(data.risks)
  const artifacts = parseHandoffArtifactList(data.artifacts)
  const evidence = parseHandoffEvidenceList(data.evidence)
  if (
    !goal &&
    !summary &&
    !decisions &&
    !nextSteps &&
    !risks &&
    !artifacts &&
    !evidence
  )
    return undefined
  return {
    ...(goal ? { goal } : {}),
    ...(summary ? { summary } : {}),
    ...(decisions ? { decisions } : {}),
    ...(nextSteps ? { nextSteps } : {}),
    ...(risks ? { risks } : {}),
    ...(artifacts ? { artifacts } : {}),
    ...(evidence ? { evidence } : {}),
  }
}

const parseTaskResultArchive = (
  content: string,
  fallbackTaskId?: string,
  archivePath?: string,
): TaskResult | null => {
  const parsed = parseArchiveDocument(content)
  const taskId = parsed.header.task_id ?? fallbackTaskId
  const status = parseStatus(parsed.header.status)
  const completedAt = parsed.header.completed_at ?? parsed.header.created_at
  if (!taskId || !status || !completedAt) return null

  const durationMs = Number(parsed.header.duration_ms)
  const usage = parseTokenUsageJson(parsed.header.usage)
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

  return {
    taskId,
    status,
    ok: status === 'succeeded',
    output: extractArchiveSection(parsed, '=== RESULT ==='),
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    completedAt,
    ...(usage ? { usage } : {}),
    ...(parsed.header.title ? { title: parsed.header.title } : {}),
    ...(archivePath ? { archivePath } : {}),
    ...(cancel ? { cancel } : {}),
    ...(handoff ? { handoff } : {}),
  }
}

export const readTaskResultArchive = (
  path: string,
  fallbackTaskId?: string,
): Promise<TaskResult | null> =>
  safe(
    'readTaskResultArchive',
    async () => {
      const content = await readTextFile(path)
      if (!content) return null
      return parseTaskResultArchive(content, fallbackTaskId, path)
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
  const found = new Map<string, TaskResult>()
  const archiveRoot = join(stateDir, 'tasks')
  const allDateDirs = sortedDirNames(
    (await listFiles(archiveRoot))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )

  for (const dateDir of resolveDateDirs(ids, allDateDirs, options.dateHints)) {
    if (found.size >= idSet.size) break
    const entries = await listFiles(join(archiveRoot, dateDir))
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (found.size >= idSet.size || found.size >= maxFiles) break
      const underscore = entry.name.indexOf('_')
      if (underscore <= 0) continue
      const taskId = entry.name.slice(0, underscore)
      if (!idSet.has(taskId) || found.has(taskId)) continue
      const result = await readTaskResultArchive(
        join(archiveRoot, dateDir, entry.name),
        taskId,
      )
      if (result) found.set(taskId, result)
    }
  }

  return Array.from(found.values())
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

const tokenizeSearchText = (text: string): string[] =>
  (text.toLowerCase().match(/\p{L}[\p{L}\p{N}_-]*/gu) ?? []).map((item) =>
    item.trim(),
  )

const buildTokenFreq = (tokens: string[]): Map<string, number> => {
  const map = new Map<string, number>()
  for (const token of tokens) map.set(token, (map.get(token) ?? 0) + 1)

  return map
}

const truncateSnippet = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (normalized.length <= MAX_DOC_SNIPPET_CHARS) return normalized
  return `${normalized.slice(0, MAX_DOC_SNIPPET_CHARS - 1).trimEnd()}…`
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
  const tokens = tokenizeSearchText(indexText)
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

  const queryTokens = tokenizeSearchText(queryText)
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
