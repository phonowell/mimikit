import { readJson, writeJson } from '../fs/json.js'

import { withStoreLock } from './store-lock.js'

export const readJsonList = <T>(path: string): Promise<T[]> =>
  readJson<T[]>(path, [])

export const writeJsonList = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  await writeJson(path, items)
}

export const updateJsonList = <T>(
  path: string,
  updater: (items: T[]) => T[] | Promise<T[]>,
): Promise<T[]> =>
  withStoreLock(path, async () => {
    const current = await readJsonList<T>(path)
    const next = await updater([...current])
    await writeJsonList(path, next)
    return next
  })

export const appendJsonList = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  if (items.length === 0) return
  await updateJsonList(path, (current) => [...current, ...items])
}

export const removeJsonListItems = async (
  path: string,
  ids: string[],
): Promise<void> => {
  await updateJsonList<{ id: string }>(path, (items) =>
    items.filter((item) => !ids.includes(item.id)),
  )
}
