import { access, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { ensureDir } from '../fs/paths.js'

import type { TokenUsage, TaskResultStatus } from '../types/index.js'

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
