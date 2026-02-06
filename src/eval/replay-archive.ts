import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { listFiles } from '../fs/paths.js'
import { safe } from '../log/safe.js'
import {
  buildLlmArchiveLookupKey,
  type LlmArchiveLookup,
  type LlmArchiveRecord,
} from '../storage/llm-archive.js'

export type ReplayArchiveIndex = {
  byKey: Map<string, LlmArchiveRecord>
  records: LlmArchiveRecord[]
}

const SECTION_PROMPT = '=== PROMPT ==='
const SECTION_OUTPUT = '=== OUTPUT ==='
const SECTION_ERROR = '=== ERROR ==='
const SECTION_MARKERS = new Set([SECTION_PROMPT, SECTION_OUTPUT, SECTION_ERROR])
const ENV_BLOCK_RE = /<MIMIKIT:environment>[\s\S]*?<\/MIMIKIT:environment>/gu

const parseArchiveHeader = (lines: string[]): Record<string, string> => {
  const header: Record<string, string> = {}
  for (const line of lines) {
    if (!line.trim()) break
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    if (!key) continue
    header[key] = line.slice(colon + 1).trim()
  }
  return header
}

const extractSection = (lines: string[], marker: string): string => {
  const start = lines.findIndex((line) => line.trim() === marker)
  if (start < 0) return ''
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    if (SECTION_MARKERS.has(line.trim())) {
      end = index
      break
    }
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .replace(/\s+$/u, '')
}

const parseFiniteNumber = (value?: string): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

const normalizeReplayPrompt = (prompt: string): string =>
  prompt
    .replace(/\r\n/gu, '\n')
    .replace(ENV_BLOCK_RE, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()

const parseUsage = (value?: string) => {
  if (!value) return undefined
  try {
    const usage = JSON.parse(value) as Record<string, unknown>
    const input =
      typeof usage.input === 'number' && Number.isFinite(usage.input)
        ? usage.input
        : undefined
    const output =
      typeof usage.output === 'number' && Number.isFinite(usage.output)
        ? usage.output
        : undefined
    const total =
      typeof usage.total === 'number' && Number.isFinite(usage.total)
        ? usage.total
        : undefined
    if (input === undefined && output === undefined && total === undefined)
      return undefined
    return {
      ...(input !== undefined ? { input } : {}),
      ...(output !== undefined ? { output } : {}),
      ...(total !== undefined ? { total } : {}),
    }
  } catch {
    return undefined
  }
}

const parseRole = (value?: string): 'manager' | 'worker' | null => {
  if (value === 'manager' || value === 'worker') return value
  return null
}

const parseAttempt = (value?: string): 'primary' | 'fallback' | undefined => {
  if (value === 'primary' || value === 'fallback') return value
  return undefined
}

const parseLlmArchiveRecord = (
  content: string,
  path: string,
): LlmArchiveRecord | null => {
  const lines = content.split(/\r?\n/)
  const header = parseArchiveHeader(lines)
  const role = parseRole(header.role)
  if (!role) return null
  const prompt = extractSection(lines, SECTION_PROMPT)
  const output = extractSection(lines, SECTION_OUTPUT)
  const error = extractSection(lines, SECTION_ERROR)
  const attempt = parseAttempt(header.attempt)
  const elapsedMs = parseFiniteNumber(header.elapsed_ms)
  const seed = parseFiniteNumber(header.seed)
  const temperature = parseFiniteNumber(header.temperature)
  const usage = parseUsage(header.usage)
  const taskId = header.task_id
  const threadId = header.thread_id
  return {
    path,
    role,
    prompt,
    output,
    ok: header.ok === 'true',
    ...(header.timestamp ? { timestamp: header.timestamp } : {}),
    ...(attempt ? { attempt } : {}),
    ...(header.model ? { model: header.model } : {}),
    ...(header.request_key ? { requestKey: header.request_key } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(taskId ? { taskId } : {}),
    ...(threadId ? { threadId } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    ...(usage ? { usage } : {}),
    ...(error ? { error } : {}),
  }
}

const readLlmArchiveRecord = (path: string): Promise<LlmArchiveRecord | null> =>
  safe(
    'readLlmArchiveRecord',
    async () => {
      const content = await readFile(path, 'utf8')
      return parseLlmArchiveRecord(content, path)
    },
    { fallback: null, meta: { path }, ignoreCodes: ['ENOENT'] },
  )

export const buildReplayArchiveIndex = async (
  archiveDir: string,
  options: { maxFiles?: number } = {},
): Promise<ReplayArchiveIndex> => {
  const maxFiles = options.maxFiles ?? 1000
  let scanned = 0
  const records: LlmArchiveRecord[] = []
  const byKey = new Map<string, LlmArchiveRecord>()
  const dayDirs = (await listFiles(archiveDir))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()

  for (const dayDir of dayDirs) {
    if (scanned >= maxFiles) break
    const dirPath = join(archiveDir, dayDir)
    const files = (await listFiles(dirPath))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()
      .reverse()
    for (const name of files) {
      if (scanned >= maxFiles) break
      scanned += 1
      const record = await readLlmArchiveRecord(join(dirPath, name))
      if (!record) continue
      records.push(record)
      if (record.requestKey && !byKey.has(record.requestKey))
        byKey.set(record.requestKey, record)
    }
  }

  return { byKey, records }
}

const matchLegacy = (record: LlmArchiveRecord, lookup: LlmArchiveLookup) => {
  if (record.role !== lookup.role) return false
  if (lookup.model !== undefined && record.model !== lookup.model) return false
  if (lookup.attempt !== undefined && record.attempt !== lookup.attempt)
    return false
  if (
    lookup.prompt !== undefined &&
    normalizeReplayPrompt(record.prompt) !==
      normalizeReplayPrompt(lookup.prompt)
  )
    return false
  if (lookup.seed !== undefined && record.seed !== lookup.seed) return false
  if (
    lookup.temperature !== undefined &&
    record.temperature !== lookup.temperature
  )
    return false
  return true
}

export const findReplayArchiveRecord = (
  index: ReplayArchiveIndex,
  lookup: LlmArchiveLookup,
): LlmArchiveRecord | null => {
  const key = buildLlmArchiveLookupKey(lookup)
  const byKey = index.byKey.get(key)
  if (byKey) return byKey
  return index.records.find((record) => matchLegacy(record, lookup)) ?? null
}
