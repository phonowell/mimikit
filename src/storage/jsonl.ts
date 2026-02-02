import { appendFile, readFile } from 'node:fs/promises'

import { writeFileAtomic } from '../fs/atomic.js'
import { logSafeError, safe } from '../log/safe.js'

import { withStoreLock } from './store-lock.js'

const splitLines = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

export const readJsonl = async <T>(path: string): Promise<T[]> => {
  const raw = await safe('readJsonl: readFile', () => readFile(path, 'utf8'), {
    fallback: null,
    meta: { path },
    ignoreCodes: ['ENOENT'],
  })
  if (!raw) return []
  const lines = splitLines(raw)
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
  await withStoreLock(path, async () => {
    await appendFile(path, payload, 'utf8')
  })
}

export const updateJsonl = <T>(
  path: string,
  updater: (items: T[]) => T[] | Promise<T[]>,
): Promise<T[]> =>
  withStoreLock(path, async () => {
    const current = await readJsonl<T>(path)
    const next = await updater([...current])
    await writeJsonl(path, next)
    return next
  })
