import {
  readJsonList,
  removeJsonListItems,
  writeJsonList,
} from './json-list.js'

import type { InboxItem } from '../types/inbox.js'

export const readInbox = (path: string): Promise<InboxItem[]> =>
  readJsonList<InboxItem>(path)

export const writeInbox = async (
  path: string,
  items: InboxItem[],
): Promise<void> => {
  await writeJsonList(path, items)
}

export const removeInboxItems = async (
  path: string,
  ids: string[],
): Promise<void> => {
  await removeJsonListItems<InboxItem>(path, ids)
}
