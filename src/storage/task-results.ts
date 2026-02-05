import { access, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { ensureDir, listFiles } from '../fs/paths.js'
import { safe } from '../log/safe.js'

import type {
  TaskResult,
  TaskResultStatus,
  TokenUsage,
} from '../types/index.js'

export const dateStamp = (iso: string): string => iso.slice(0, 10)

export const pushLine = (
  lines: string[],
  label: string,
  value?: string | number,
): void => {
  if (value === undefined || value === '') return
  lines.push(`${label}: ${value}`)
}

export const formatSection = (title: string, content: string): string =>
  `${title}\n${content}`

export type TaskArchiveEntry = {
  taskId?: string
  title: string
  status: TaskResultStatus
  prompt: string
  output: string
  createdAt: string
  completedAt: string
  durationMs: number
  usage?: TokenUsage
}

const compactTimestamp = (iso: string): string => {
  const date = iso.slice(0, 10).replace(/-/g, '')
  const time = iso.slice(11, 19).replace(/:/g, '')
  return `${date}_${time}`
}

const sanitizePart = (value: string, limit = 60): string => {
  const ascii = value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
  const dashed = ascii
    .replace(/['"]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const trimmed = dashed.slice(0, Math.max(0, limit))
  return trimmed.replace(/-+$/g, '')
}

const buildFilename = (entry: TaskArchiveEntry): string => {
  const trimmedId = entry.taskId?.trim()
  const id =
    trimmedId && trimmedId.length > 0
      ? trimmedId
      : compactTimestamp(entry.completedAt)
  const safeTitle = sanitizePart(entry.title) || 'task'
  return `${id}_${safeTitle}.md`
}

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch (error) {
    const code =
      typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : undefined
    if (code === 'ENOENT') return false
    throw error
  }
}

const ensureUniquePath = async (basePath: string): Promise<string> => {
  if (!(await pathExists(basePath))) return basePath
  const ext = extname(basePath)
  const head = basePath.slice(0, basePath.length - ext.length)
  for (let i = 1; i < 1000; i += 1) {
    const suffix = String(i).padStart(2, '0')
    const candidate = `${head}_${suffix}${ext}`
    if (!(await pathExists(candidate))) return candidate
  }
  return `${head}_${Date.now()}${ext}`
}

const buildArchiveContent = (entry: TaskArchiveEntry): string => {
  const lines: string[] = []
  pushLine(lines, 'task_id', entry.taskId ?? '')
  pushLine(lines, 'title', entry.title)
  pushLine(lines, 'status', entry.status)
  pushLine(lines, 'created_at', entry.createdAt)
  pushLine(lines, 'completed_at', entry.completedAt)
  pushLine(lines, 'duration_ms', entry.durationMs)
  if (entry.usage) pushLine(lines, 'usage', JSON.stringify(entry.usage))
  const header = lines.join('\n')
  const sections = [
    formatSection('=== PROMPT ===', entry.prompt),
    formatSection('=== RESULT ===', entry.output),
  ]
  return `${header}\n\n${sections.join('\n\n')}\n`
}

export const appendTaskResultArchive = async (
  stateDir: string,
  entry: TaskArchiveEntry,
): Promise<string> => {
  const dateDir = dateStamp(entry.completedAt)
  const dir = join(stateDir, 'results', dateDir)
  await ensureDir(dir)
  const filename = buildFilename(entry)
  const path = await ensureUniquePath(join(dir, filename))
  const content = buildArchiveContent(entry)
  await writeFile(path, content, 'utf8')
  return path
}

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
  const resultsDir = join(stateDir, 'results')
  const allDateDirs = (await listFiles(resultsDir))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
  const hintedDirs = new Map<string, Set<string>>()
  const unhinted = new Set<string>()
  const hints = options.dateHints ?? {}
  for (const id of trimmed) {
    const hint = hints[id]
    if (hint) {
      if (!hintedDirs.has(hint)) hintedDirs.set(hint, new Set())
      hintedDirs.get(hint)?.add(id)
    } else unhinted.add(id)
  }
  const scanAll = unhinted.size > 0 || hintedDirs.size === 0
  const dateDirs = scanAll
    ? allDateDirs
    : Array.from(hintedDirs.keys()).sort().reverse()
  const found = new Map<string, TaskResult>()
  const maxFiles =
    options.maxFiles ?? (scanAll ? 500 : Number.POSITIVE_INFINITY)
  let scanned = 0
  for (const dateDir of dateDirs) {
    if (found.size >= idSet.size) break
    const dirPath = join(resultsDir, dateDir)
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
      if (!targetIds.has(taskId)) continue
      if (found.has(taskId)) continue
      const path = join(dirPath, name)
      const result = await readTaskResultArchive(path, taskId)
      if (result) found.set(taskId, result)
    }
    if (scanned > maxFiles) break
  }
  return Array.from(found.values())
}
