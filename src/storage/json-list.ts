import { readJson, writeJson } from '../fs/json.js'

export const readJsonList = <T>(path: string): Promise<T[]> =>
  readJson<T[]>(path, [])

export const writeJsonList = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  await writeJson(path, items)
}

export const appendJsonList = async <T>(
  path: string,
  items: T[],
): Promise<void> => {
  if (items.length === 0) return
  const current = await readJsonList<T>(path)
  await writeJsonList(path, [...current, ...items])
}

export const removeJsonListItems = async <T extends { id: string }>(
  path: string,
  ids: string[],
): Promise<void> => {
  const items = await readJsonList<T>(path)
  const remaining = items.filter((item) => !ids.includes(item.id))
  await writeJsonList(path, remaining)
}
