import {
  appendJsonList,
  readJsonList,
  removeJsonListItems,
} from './json-list.js'

import type { TellerEvent } from '../types/teller.js'

export const readTellerInbox = (path: string): Promise<TellerEvent[]> =>
  readJsonList<TellerEvent>(path)

export const appendTellerInbox = async (
  path: string,
  items: TellerEvent[],
): Promise<void> => {
  await appendJsonList(path, items)
}

export const removeTellerInboxItems = async (
  path: string,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return
  await removeJsonListItems(path, ids)
}
