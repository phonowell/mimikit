import { appendJsonl, readJsonl } from './jsonl.js'

import type { HistoryMessage } from '../types/history.js'

export const readHistory = (path: string): Promise<HistoryMessage[]> =>
  readJsonl<HistoryMessage>(path)

export const appendHistory = async (
  path: string,
  message: HistoryMessage,
): Promise<void> => {
  await appendJsonl(path, [message])
}
