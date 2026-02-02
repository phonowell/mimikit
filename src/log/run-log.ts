import {
  appendFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { nowIso } from '../time.js'

import { logSafeError, safe } from './safe.js'

export type RunLogKind = 'task' | 'trigger'

export type RunLogEntry = {
  ts: string
  action: 'started' | 'finished'
  status?: 'ok' | 'error' | 'skipped'
  error?: string
  durationMs?: number
  attempts?: number
  taskId?: string
  triggerId?: string
  sourceTriggerId?: string
  traceId?: string
}

const writesByPath = new Map<string, Promise<void>>()

const pruneIfNeeded = async (
  filePath: string,
  opts: { maxBytes: number; keepLines: number },
) => {
  const info = await safe('pruneRunLog: stat', () => stat(filePath), {
    fallback: null,
    meta: { path: filePath },
  })
  if (!info || info.size <= opts.maxBytes) return
  const raw = await safe(
    'pruneRunLog: readFile',
    () => readFile(filePath, 'utf8'),
    {
      fallback: '',
      meta: { path: filePath },
    },
  )
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const kept = lines.slice(Math.max(0, lines.length - opts.keepLines))
  const tmp = `${filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`
  await writeFile(tmp, `${kept.join('\n')}\n`, 'utf8')
  await rename(tmp, filePath)
}

export const resolveRunLogPath = (dir: string, id: string): string =>
  join(dir, `${id}.jsonl`)

export const appendRunLog = async (
  dir: string,
  id: string,
  entry: Omit<RunLogEntry, 'ts'> & { ts?: string },
  opts?: { maxBytes?: number; keepLines?: number },
): Promise<void> => {
  const filePath = resolveRunLogPath(dir, id)
  const prev = writesByPath.get(filePath) ?? Promise.resolve()
  const next = prev
    .catch((error) =>
      logSafeError('appendRunLog: previous', error, {
        meta: { path: filePath },
      }),
    )
    .then(async () => {
      await mkdir(dirname(filePath), { recursive: true })
      const payload = { ts: entry.ts ?? nowIso(), ...entry }
      await appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8')
      await pruneIfNeeded(filePath, {
        maxBytes: opts?.maxBytes ?? 2_000_000,
        keepLines: opts?.keepLines ?? 2_000,
      })
    })
  writesByPath.set(filePath, next)
  await next
}

export const readRunLog = async (
  dir: string,
  id: string,
  opts?: { limit?: number },
): Promise<RunLogEntry[]> => {
  const limit = Math.max(1, Math.min(5000, Math.floor(opts?.limit ?? 200)))
  const filePath = resolveRunLogPath(dir, id)
  const raw = await safe(
    'readRunLog: readFile',
    () => readFile(filePath, 'utf8'),
    {
      fallback: '',
      meta: { path: filePath },
    },
  )
  if (!raw.trim()) return []
  const lines = raw.split('\n')
  const entries: RunLogEntry[] = []
  let parseWarned = false
  for (let i = lines.length - 1; i >= 0 && entries.length < limit; i -= 1) {
    const line = lines[i]?.trim()
    if (!line) continue
    try {
      const obj = JSON.parse(line) as unknown
      if (!obj || typeof obj !== 'object') continue
      const entry = obj as Partial<RunLogEntry>
      if (!entry.ts || !entry.action) continue
      entries.push(entry as RunLogEntry)
    } catch (error) {
      if (!parseWarned) {
        parseWarned = true
        void logSafeError('readRunLog: parse', error, {
          meta: { path: filePath, line: line.slice(0, 200) },
        })
      }
    }
  }
  return entries.reverse()
}
