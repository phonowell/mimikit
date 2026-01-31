import { readJson, writeJson } from '../fs/json.js'

import type { TellerEvent } from '../types/teller.js'

export const readTellerInbox = (path: string): Promise<TellerEvent[]> =>
  readJson<TellerEvent[]>(path, [])

export const writeTellerInbox = async (
  path: string,
  items: TellerEvent[],
): Promise<void> => {
  await writeJson(path, items)
}

export const appendTellerInbox = async (
  path: string,
  items: TellerEvent[],
): Promise<void> => {
  if (items.length === 0) return
  const current = await readTellerInbox(path)
  await writeTellerInbox(path, [...current, ...items])
}

export const removeTellerInboxItems = async (
  path: string,
  ids: string[],
): Promise<void> => {
  if (ids.length === 0) return
  const items = await readTellerInbox(path)
  const remaining = items.filter((item) => !ids.includes(item.id))
  await writeTellerInbox(path, remaining)
}
