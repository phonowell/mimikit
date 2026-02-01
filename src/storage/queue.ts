import { rename } from 'node:fs/promises'
import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import { listJsonPaths } from './dir.js'
import { withStoreLock } from './store-lock.js'

const DEFAULT_LIST_CONCURRENCY = 16

export const readItem = async <T>(
  path: string,
  migrate?: (value: unknown) => T | null,
): Promise<T | null> => {
  try {
    const raw = await readJson<unknown>(path, null as unknown)
    if (!raw) return null
    return migrate ? migrate(raw) : (raw as T)
  } catch {
    return null
  }
}

export const writeItem = async (dir: string, id: string, value: unknown) => {
  const path = join(dir, `${id}.json`)
  await writeJson(path, value)
  return path
}

export const removeItem = async (path: string): Promise<void> => {
  try {
    await import('node:fs/promises').then((fs) => fs.unlink(path))
  } catch {
    // ignore
  }
}

export const listItems = async <T>(
  dir: string,
  migrate?: (value: unknown) => T | null,
): Promise<T[]> => {
  const paths = await listJsonPaths(dir)
  if (paths.length === 0) return []

  const results: Array<T | null> = new Array(paths.length)
  const limit = Math.max(1, Math.min(DEFAULT_LIST_CONCURRENCY, paths.length))
  let next = 0

  const workers = Array.from({ length: limit }, async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= paths.length) return
      const path = paths[index]
      if (!path) return
      results[index] = await readItem<T>(path, migrate)
    }
  })
  await Promise.all(workers)

  return results.filter((item): item is T => Boolean(item))
}

export const claimItem = <T>(
  params: {
    queueDir: string
    runningDir: string
    id: string
    update?: (item: T) => T
  },
  migrate?: (value: unknown) => T | null,
): Promise<T | null> =>
  withStoreLock(params.queueDir, async () => {
    const queuePath = join(params.queueDir, `${params.id}.json`)
    const runningPath = join(params.runningDir, `${params.id}.json`)
    try {
      await rename(queuePath, runningPath)
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : null
      if (code === 'ENOENT') return null
      throw error
    }
    const item = await readItem<T>(runningPath, migrate)
    if (!item) return null
    const updated = params.update ? params.update(item) : item
    if (updated !== item) await writeJson(runningPath, updated)
    return updated
  })
