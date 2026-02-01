import {
  appendJsonList,
  readJsonList,
  removeJsonListItems,
} from './json-list.js'

import type { InboxItem } from '../types/inbox.js'

export const readInbox = (path: string): Promise<InboxItem[]> =>
  readJsonList<InboxItem>(path)

export const appendInboxItems = async (
  path: string,
  items: InboxItem[],
): Promise<void> => {
  await appendJsonList(path, items)
}

export const removeInboxItems = async (
  path: string,
  ids: string[],
): Promise<void> => {
  await removeJsonListItems(path, ids)
}
