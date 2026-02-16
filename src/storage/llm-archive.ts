import { join } from 'node:path'

import write from 'fire-keeper/write'

import { ensureDir } from '../fs/paths.js'
import { nowIso, shortId } from '../shared/utils.js'

import { buildArchiveDocument, dateStamp } from './archive-format.js'

import type { TokenUsage } from '../types/index.js'

export type LlmArchiveEntry = {
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

export type LlmArchiveResult = {
  output: string
  ok: boolean
  elapsedMs?: number
  usage?: TokenUsage
  error?: string
  errorName?: string
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

export const appendLlmArchive = async (
  stateDir: string,
  entry: LlmArchiveEntry,
): Promise<void> => {
  const timestamp = nowIso()
  const path = buildArchivePath(stateDir, timestamp, entry)
  await ensureDir(join(stateDir, 'llm', dateStamp(timestamp)))
  const content = buildArchiveContent(timestamp, entry)
  await write(path, content, { encoding: 'utf8' }, { echo: false })
}

export const appendLlmArchiveResult = (
  stateDir: string,
  base: Omit<LlmArchiveEntry, 'prompt' | 'output' | 'ok'>,
  prompt: string,
  result: LlmArchiveResult,
): Promise<void> =>
  appendLlmArchive(stateDir, {
    ...base,
    prompt,
    output: result.output,
    ok: result.ok,
    ...(result.elapsedMs !== undefined ? { elapsedMs: result.elapsedMs } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.errorName ? { errorName: result.errorName } : {}),
  })
