import { rename } from 'node:fs/promises'
import { join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import { listJsonPaths } from './dir.js'
import { withStoreLock } from './store-lock.js'

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
  const items: T[] = []
  for (const path of paths) {
    const item = await readItem<T>(path, migrate)
    if (item) items.push(item)
  }
  return items
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
