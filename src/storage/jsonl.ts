import { dirname } from 'node:path'

import read from 'fire-keeper/read'
import write from 'fire-keeper/write'

import { writeFileAtomic } from '../fs/json.js'
import { ensureDir, ensureFile } from '../fs/paths.js'
import { logSafeError, safe } from '../log/safe.js'

import type { HistoryMessage } from '../types/index.js'

type JsonlReadOptions<T> = {
  validate?: (value: unknown) => T | undefined | null
}

const updateQueue = new Map<string, Promise<void>>()

export const toUtf8Text = (raw: unknown): string => {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  return ''
}

const splitNonEmptyLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const runSerialized = async <T>(
  path: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = updateQueue.get(path) ?? Promise.resolve()
  const safePrevious = previous.catch(() => undefined)
  let release!: () => void
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  updateQueue.set(path, next)
  await safePrevious
  try {
    return await fn()
  } finally {
    release()
    if (updateQueue.get(path) === next) updateQueue.delete(path)
  }
}

export const readJsonl = async <T>(
  path: string,
  options: JsonlReadOptions<T> & { ensureFile?: boolean } = {},
): Promise<T[]> => {
  const readRaw = () =>
    safe('readJsonl: readFile', () => read(path, { raw: true, echo: false }), {
      fallback: null,
      meta: { path },
      ignoreCodes: ['ENOENT'],
    })

  let raw = await readRaw()
  if (!raw && options.ensureFile) {
    await ensureFile(path, '')
    raw = await readRaw()
  }

  const text = toUtf8Text(raw)
  if (!text) return []
  const lines = splitNonEmptyLines(text)
  if (lines.length === 0) return []
  const items: T[] = []
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown
      const normalized = options.validate
        ? options.validate(parsed)
        : (parsed as T)
      if (normalized !== undefined && normalized !== null)
        items.push(normalized)
    } catch (error) {
      await logSafeError('readJsonl: parse', error, { meta: { path, line } })
    }
  }
  return items
}

export const writeJsonl = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  const body = items.map((item) => JSON.stringify(item)).join('\n')
  const payload = body.length > 0 ? `${body}\n` : ''
  await writeFileAtomic(path, payload)
}

export const appendJsonl = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  if (items.length === 0) return
  await ensureDir(dirname(path))
  const body = items.map((item) => JSON.stringify(item)).join('\n')
  const payload = `${body}\n`
  await write(path, payload, { flag: 'a', encoding: 'utf8' }, { echo: false })
}

export const updateJsonl = <T>(
  path: string,
  updater: (items: T[]) => T[] | Promise<T[]>,
): Promise<T[]> =>
  runSerialized(path, async () => {
    const current = await readJsonl<T>(path)
    const next = await updater([...current])
    await writeJsonl(path, next)
    return next
  })

const MAX_HISTORY_ITEMS = 1000

const capHistory = (items: HistoryMessage[]): HistoryMessage[] => {
  if (items.length <= MAX_HISTORY_ITEMS) return items
  return items.slice(Math.max(0, items.length - MAX_HISTORY_ITEMS))
}

export const readHistory = (path: string): Promise<HistoryMessage[]> =>
  readJsonl<HistoryMessage>(path, { ensureFile: true })

export const appendHistory = async (
  path: string,
  message: HistoryMessage,
): Promise<void> => {
  await updateJsonl<HistoryMessage>(path, (current) =>
    capHistory([...current, message]),
  )
}
