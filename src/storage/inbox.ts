import { readJson, writeJson } from '../fs/json.js'

import type { InboxItem } from '../types/inbox.js'

export const readInbox = (path: string): Promise<InboxItem[]> =>
  readJson<InboxItem[]>(path, [])

export const writeInbox = async (
  path: string,
  items: InboxItem[],
): Promise<void> => {
  await writeJson(path, items)
}

export const removeInboxItems = async (
  path: string,
  ids: string[],
): Promise<void> => {
  const items = await readInbox(path)
  const remaining = items.filter((item) => !ids.includes(item.id))
  await writeInbox(path, remaining)
}
