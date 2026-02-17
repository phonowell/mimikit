import { join } from 'node:path'

import write from 'fire-keeper/write'

import { ensureDir } from '../fs/paths.js'
import { nowIso } from '../shared/utils.js'

import { buildArchiveDocument, dateStamp } from './archive-format.js'

import type { TokenUsage } from '../types/index.js'

export type TraceArchiveEntry = {
  role: 'manager' | 'worker'
  prompt: string
  output: string
  ok: boolean
  elapsedMs?: number
  usage?: TokenUsage
  model?: string
  attempt?: 'primary' | 'fallback'
  seed?: number
  temperature?: number
  error?: string
  errorName?: string
  taskId?: string
  threadId?: string | null
}

export type TraceArchiveResult = {
  output: string
  ok: boolean
  elapsedMs?: number
  usage?: TokenUsage
  error?: string
  errorName?: string
}

const compactTimestamp36 = (iso: string): string => {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return Date.now().toString(36).padStart(9, '0')
  return Math.trunc(ms).toString(36).padStart(9, '0')
}

const roleCode = (role: TraceArchiveEntry['role']): 'm' | 'w' =>
  role === 'manager' ? 'm' : 'w'

const attemptCode = (
  attempt: TraceArchiveEntry['attempt'],
): 'p' | 'f' | 'n' => {
  if (attempt === 'primary') return 'p'
  if (attempt === 'fallback') return 'f'
  return 'n'
}

const buildArchivePath = (
  stateDir: string,
  iso: string,
  entry: TraceArchiveEntry,
): string => {
  const dateDir = dateStamp(iso)
  const filename = `${compactTimestamp36(iso)}${roleCode(entry.role)}${attemptCode(
    entry.attempt,
  )}.txt`
  return join(stateDir, 'traces', dateDir, filename)
}

const buildArchiveContent = (
  timestamp: string,
  entry: TraceArchiveEntry,
): string =>
  buildArchiveDocument(
    [
      ['timestamp', timestamp],
      ['role', entry.role],
      ['attempt', entry.attempt],
      ['model', entry.model],
      ['seed', entry.seed],
      ['temperature', entry.temperature],
      ['task_id', entry.taskId],
      ['thread_id', entry.threadId ?? undefined],
      ['ok', entry.ok ? 'true' : 'false'],
      ['elapsed_ms', entry.elapsedMs],
      ['usage', entry.usage ? JSON.stringify(entry.usage) : undefined],
      ['error_name', entry.errorName],
    ],
    [
      { marker: '=== PROMPT ===', content: entry.prompt },
      { marker: '=== OUTPUT ===', content: entry.output },
      ...(entry.error
        ? [{ marker: '=== ERROR ===', content: entry.error }]
        : []),
    ],
  )

export const appendTraceArchive = async (
  stateDir: string,
  entry: TraceArchiveEntry,
): Promise<void> => {
  const timestamp = nowIso()
  const path = buildArchivePath(stateDir, timestamp, entry)
  await ensureDir(join(stateDir, 'traces', dateStamp(timestamp)))
  const content = buildArchiveContent(timestamp, entry)
  await write(path, content, { encoding: 'utf8' }, { echo: false })
}

export const appendTraceArchiveResult = (
  stateDir: string,
  base: Omit<TraceArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: TraceArchiveResult,
): Promise<void> =>
  appendTraceArchive(stateDir, {
    ...base,
    prompt,
    output: result.output,
    ok: result.ok,
    ...(result.elapsedMs !== undefined ? { elapsedMs: result.elapsedMs } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.errorName ? { errorName: result.errorName } : {}),
  })
