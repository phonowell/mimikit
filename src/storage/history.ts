import { readJson, writeJson } from '../fs/json.js'

import type { HistoryMessage } from '../types/history.js'

export const readHistory = (path: string): Promise<HistoryMessage[]> =>
  readJson<HistoryMessage[]>(path, [])

export const writeHistory = async (
  path: string,
  messages: HistoryMessage[],
): Promise<void> => {
  await writeJson(path, messages)
}

export const appendHistory = async (
  path: string,
  message: HistoryMessage,
): Promise<void> => {
  const history = await readHistory(path)
  history.push(message)
  await writeHistory(path, history)
}
