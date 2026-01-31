import { basename, join } from 'node:path'

import { readJson, writeJson } from '../fs/json.js'

import { listJsonPaths } from './dir.js'

export const readItem = async <T>(path: string): Promise<T | null> => {
  try {
    return await readJson<T>(path, null as T)
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

export const listItems = async <T>(dir: string): Promise<T[]> => {
  const paths = await listJsonPaths(dir)
  const items: T[] = []
  for (const path of paths) {
    const item = await readItem<T>(path)
    if (item) items.push(item)
  }
  return items
}

export const idFromPath = (path: string): string =>
  basename(path).replace(/\.json$/, '')
