import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ensureDir } from '../fs/paths.js'
import { nowIso, shortId } from '../shared/utils.js'

import { dateStamp, formatSection, pushLine } from './task-results.js'

import type { TokenUsage } from '../types/index.js'

export type LlmArchiveEntry = {
  role: 'manager' | 'worker' | 'local'
  prompt: string
  output: string
  ok: boolean
  elapsedMs?: number
  usage?: TokenUsage
  model?: string
  attempt?: 'primary' | 'fallback'
  error?: string
  errorName?: string
  taskId?: string
  threadId?: string | null
}

const timeStamp = (iso: string): string =>
  iso.slice(11, 23).replace(/:/g, '').replace('.', '-')

const buildArchivePath = (
  stateDir: string,
  iso: string,
  entry: LlmArchiveEntry,
): string => {
  const dateDir = dateStamp(iso)
  const time = timeStamp(iso)
  const parts = [time, entry.role]
  if (entry.attempt) parts.push(entry.attempt)
  parts.push(shortId())
  const filename = `${parts.join('-')}.txt`
  return join(stateDir, 'llm', dateDir, filename)
}

const buildArchiveContent = (
  timestamp: string,
  entry: LlmArchiveEntry,
): string => {
  const lines: string[] = []
  pushLine(lines, 'timestamp', timestamp)
  pushLine(lines, 'role', entry.role)
  pushLine(lines, 'attempt', entry.attempt)
  pushLine(lines, 'model', entry.model)
  pushLine(lines, 'task_id', entry.taskId)
  pushLine(lines, 'thread_id', entry.threadId ?? undefined)
  pushLine(lines, 'ok', entry.ok ? 'true' : 'false')
  pushLine(lines, 'elapsed_ms', entry.elapsedMs)
  if (entry.usage) pushLine(lines, 'usage', JSON.stringify(entry.usage))
  const header = lines.join('\n')
  const sections = [
    formatSection('=== PROMPT ===', entry.prompt),
    formatSection('=== OUTPUT ===', entry.output),
  ]
  if (entry.error) sections.push(formatSection('=== ERROR ===', entry.error))
  return `${header}\n\n${sections.join('\n\n')}\n`
}

export const appendLlmArchive = async (
  stateDir: string,
  entry: LlmArchiveEntry,
): Promise<void> => {
  const timestamp = nowIso()
  const path = buildArchivePath(stateDir, timestamp, entry)
  await ensureDir(join(stateDir, 'llm', dateStamp(timestamp)))
  const content = buildArchiveContent(timestamp, entry)
  await writeFile(path, content, 'utf8')
}
