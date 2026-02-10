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
  requestKey?: string
  seed?: number
  temperature?: number
  error?: string
  errorName?: string
  taskId?: string
  threadId?: string | null
}

export type LlmArchiveLookup = {
  role: 'manager' | 'worker'
  model?: string
  attempt?: 'primary' | 'fallback'
  prompt?: string
  messages?: unknown
  toolSchema?: unknown
  toolInputs?: unknown
  seed?: number
  temperature?: number
}

export type LlmArchiveRecord = {
  path: string
  role: 'manager' | 'worker'
  prompt: string
  output: string
  ok: boolean
  timestamp?: string
  attempt?: 'primary' | 'fallback'
  model?: string
  requestKey?: string
  seed?: number
  temperature?: number
  taskId?: string
  threadId?: string
  elapsedMs?: number
  usage?: TokenUsage
  error?: string
}

export type LlmArchiveResult = {
  output: string
  ok: boolean
  elapsedMs?: number
  usage?: TokenUsage
  error?: string
  errorName?: string
}

const normalizeForKey = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => normalizeForKey(item))
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeForKey(item)])
    return Object.fromEntries(entries)
  }
  return value
}

export const buildLlmArchiveLookupKey = (lookup: LlmArchiveLookup): string =>
  JSON.stringify(
    normalizeForKey({
      role: lookup.role,
      model: lookup.model ?? null,
      attempt: lookup.attempt ?? null,
      prompt: lookup.prompt ?? null,
      messages: lookup.messages ?? null,
      toolSchema: lookup.toolSchema ?? null,
      toolInputs: lookup.toolInputs ?? null,
      seed: lookup.seed ?? null,
      temperature: lookup.temperature ?? null,
    }),
  )

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
      ['request_key', entry.requestKey],
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
  await write(path, content, { encoding: 'utf8' })
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
