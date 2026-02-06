import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { listFiles } from '../fs/paths.js'
import { safe } from '../log/safe.js'

import type {
  TaskResult,
  TaskResultStatus,
  TokenUsage,
} from '../types/index.js'

const parseStatus = (value?: string): TaskResultStatus | null => {
  if (value === 'succeeded' || value === 'failed' || value === 'canceled')
    return value
  return null
}

const parseUsage = (raw?: string): TokenUsage | undefined => {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const input =
      typeof parsed.input === 'number' && Number.isFinite(parsed.input)
        ? parsed.input
        : undefined
    const output =
      typeof parsed.output === 'number' && Number.isFinite(parsed.output)
        ? parsed.output
        : undefined
    const total =
      typeof parsed.total === 'number' && Number.isFinite(parsed.total)
        ? parsed.total
        : undefined
    if (input === undefined && output === undefined && total === undefined)
      return undefined
    const usage: TokenUsage = {}
    if (input !== undefined) usage.input = input
    if (output !== undefined) usage.output = output
    if (total !== undefined) usage.total = total
    return usage
  } catch {
    return undefined
  }
}

const parseArchiveHeader = (lines: string[]): Record<string, string> => {
  const header: Record<string, string> = {}
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) continue
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
  const index = lines.findIndex((line) => line.trim() === marker)
  if (index < 0) return ''
  return lines
    .slice(index + 1)
    .join('\n')
    .replace(/\s+$/u, '')
}

const parseTaskResultArchive = (
  content: string,
  fallbackTaskId?: string,
  archivePath?: string,
): TaskResult | null => {
  const lines = content.split(/\r?\n/)
  const header = parseArchiveHeader(lines)
  const taskId = header.task_id ?? fallbackTaskId
  if (!taskId) return null
  const status = parseStatus(header.status)
  if (!status) return null
  const completedAt = header.completed_at ?? header.created_at
  if (!completedAt) return null
  const durationMs = Number(header.duration_ms)
  const normalizedDuration = Number.isFinite(durationMs) ? durationMs : 0
  const output = extractSection(lines, '=== RESULT ===')
  const usage = parseUsage(header.usage)
  return {
    taskId,
    status,
    ok: status === 'succeeded',
    output,
    durationMs: normalizedDuration,
    completedAt,
    ...(usage ? { usage } : {}),
    ...(header.title ? { title: header.title } : {}),
    ...(archivePath ? { archivePath } : {}),
  }
}

export const readTaskResultArchive = (
  path: string,
  fallbackTaskId?: string,
): Promise<TaskResult | null> =>
  safe(
    'readTaskResultArchive',
    async () => {
      const content = await readFile(path, 'utf8')
      return parseTaskResultArchive(content, fallbackTaskId, path)
    },
    { fallback: null, meta: { path }, ignoreCodes: ['ENOENT'] },
  )

export type ReadTaskResultsOptions = {
  maxFiles?: number
  dateHints?: Record<string, string>
}

export const readTaskResultsForTasks = async (
  stateDir: string,
  taskIds: string[],
  options: ReadTaskResultsOptions = {},
): Promise<TaskResult[]> => {
  const trimmed = taskIds.map((id) => id.trim()).filter((id) => id.length > 0)
  if (trimmed.length === 0) return []
  const idSet = new Set(trimmed)
  const hintedDirs = new Map<string, Set<string>>()
  const unhinted = new Set<string>()
  const hints = options.dateHints ?? {}
  for (const id of trimmed) {
    const hint = hints[id]
    if (hint) {
      if (!hintedDirs.has(hint)) hintedDirs.set(hint, new Set())
      hintedDirs.get(hint)?.add(id)
      continue
    }
    unhinted.add(id)
  }

  const scanAll = unhinted.size > 0 || hintedDirs.size === 0
  const found = new Map<string, TaskResult>()
  const maxFiles =
    options.maxFiles ?? (scanAll ? 500 : Number.POSITIVE_INFINITY)
  let scanned = 0
  const archiveRoot = join(stateDir, 'tasks')
  const allDateDirs = (await listFiles(archiveRoot))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
  const dateDirs = scanAll
    ? allDateDirs
    : Array.from(hintedDirs.keys()).sort().reverse()

  for (const dateDir of dateDirs) {
    if (found.size >= idSet.size) break
    const dirPath = join(archiveRoot, dateDir)
    const entries = await listFiles(dirPath)
    const targetIds = scanAll ? idSet : hintedDirs.get(dateDir)
    if (!targetIds || targetIds.size === 0) continue
    for (const entry of entries) {
      if (found.size >= idSet.size) break
      if (!entry.isFile()) continue
      scanned += 1
      if (scanned > maxFiles) break
      const { name } = entry
      const underscore = name.indexOf('_')
      if (underscore <= 0) continue
      const taskId = name.slice(0, underscore)
      if (!targetIds.has(taskId) || found.has(taskId)) continue
      const path = join(dirPath, name)
      const result = await readTaskResultArchive(path, taskId)
      if (result) found.set(taskId, result)
    }
    if (scanned > maxFiles) break
  }
  return Array.from(found.values())
}
