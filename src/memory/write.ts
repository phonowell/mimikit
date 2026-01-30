import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type MemoryEntry = {
  title: string
  lines: string[]
  timestamp: string
  source: string
}

export type MemoryWriteResult = {
  path: string
  created: boolean
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export const formatDate = (date: Date): string =>
  date.toISOString().slice(0, 10)

export const formatTimestamp = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, 'Z')

const ensureDir = async (dir: string) => {
  await mkdir(dir, { recursive: true })
}

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const ensureUniquePath = async (path: string): Promise<string> => {
  if (!(await fileExists(path))) return path
  const idx = path.lastIndexOf('.')
  const base = idx >= 0 ? path.slice(0, idx) : path
  const ext = idx >= 0 ? path.slice(idx) : ''
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}-${i}${ext}`
    if (!(await fileExists(candidate))) return candidate
  }
  return path
}

const formatEntry = (entry: MemoryEntry): string => {
  const lines: string[] = []
  lines.push(`## ${entry.timestamp} ${entry.title}`)
  lines.push(`- source: ${entry.source}`)
  if (entry.lines.length > 0) {
    lines.push('- transcript:')
    for (const line of entry.lines) lines.push(`  - ${line}`)
  }
  return lines.join('\n')
}

export const appendDailyMemory = async (params: {
  workDir: string
  date: Date
  entry: MemoryEntry
}): Promise<MemoryWriteResult> => {
  const day = formatDate(params.date)
  if (!DATE_ONLY.test(day)) throw new Error(`Invalid date: ${day}`)
  const dir = join(params.workDir, 'memory')
  await ensureDir(dir)
  const path = join(dir, `${day}.md`)
  const exists = await fileExists(path)
  const content = formatEntry(params.entry)
  if (!exists) {
    await writeFile(path, `# Memory ${day}\n\n${content}\n`)
    return { path, created: true }
  }
  await appendFile(path, `\n${content}\n`)
  return { path, created: false }
}

export const appendLongTermMemory = async (params: {
  workDir: string
  lines: string[]
}): Promise<MemoryWriteResult> => {
  const path = join(params.workDir, 'MEMORY.md')
  const exists = await fileExists(path)
  const content = params.lines.join('\n')
  if (!exists) {
    await writeFile(path, `# MEMORY\n\n${content}\n`)
    return { path, created: true }
  }
  await appendFile(path, `\n${content}\n`)
  return { path, created: false }
}

export const writeSessionMemoryFile = async (params: {
  workDir: string
  date: Date
  slug: string
  source: string
  messages: string[]
}): Promise<MemoryWriteResult> => {
  const day = formatDate(params.date)
  const dir = join(params.workDir, 'memory')
  await ensureDir(dir)
  const safeSlug =
    params.slug.trim() ||
    formatTimestamp(params.date).slice(11, 16).replace(':', '')
  const filePath = join(dir, `${day}-${safeSlug}.md`)
  const path = await ensureUniquePath(filePath)
  const header = [
    `# Session: ${formatTimestamp(params.date)}`,
    `- source: ${params.source}`,
    `- messages: ${params.messages.length}`,
    '',
    '## Transcript',
  ]
    .filter(Boolean)
    .join('\n')
  const body = params.messages
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
  await writeFile(path, `${header}\n${body}\n`)
  return { path, created: true }
}

export const readTextFile = (path: string): Promise<string> =>
  readFile(path, 'utf-8')
