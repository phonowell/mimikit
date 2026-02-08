import read from 'fire-keeper/read'
import write from 'fire-keeper/write'

import { writeFileAtomic } from '../fs/json.js'
import { logSafeError, safe } from '../log/safe.js'

import type { HistoryMessage } from '../types/index.js'

const normalizeReadText = (raw: unknown): string => {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  return ''
}

const splitLines = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const updateQueue = new Map<string, Promise<void>>()

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

export const readJsonl = async <T>(path: string): Promise<T[]> => {
  const raw = await safe(
    'readJsonl: readFile',
    () => read(path, { raw: true }),
    {
      fallback: null,
      meta: { path },
      ignoreCodes: ['ENOENT'],
    },
  )
  const text = normalizeReadText(raw)
  if (!text) return []
  const lines = splitLines(text)
  if (lines.length === 0) return []
  const items: T[] = []
  for (const line of lines) {
    try {
      items.push(JSON.parse(line) as T)
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
  const body = items.map((item) => JSON.stringify(item)).join('\n')
  const payload = `${body}\n`
  await write(path, payload, { flag: 'a', encoding: 'utf8' })
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
  readJsonl<HistoryMessage>(path)

export const appendHistory = async (
  path: string,
  message: HistoryMessage,
): Promise<void> => {
  await updateJsonl<HistoryMessage>(path, (current) =>
    capHistory([...current, message]),
  )
}
