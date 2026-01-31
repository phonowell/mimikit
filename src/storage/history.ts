import { readJson, writeJson } from '../fs/json.js'

import type { HistoryMessage } from '../types/history.js'

const normalizeHistory = (
  messages: HistoryMessage[],
): { normalized: HistoryMessage[]; changed: boolean } => {
  let changed = false
  const normalized = messages.map((message) => {
    const role: HistoryMessage['role'] =
      message.role === 'user' ? 'user' : 'agent'
    if (role !== message.role) {
      changed = true
      return { ...message, role }
    }
    return message
  })
  return { normalized, changed }
}

export const normalizeHistoryFile = async (path: string): Promise<void> => {
  const history = await readJson<HistoryMessage[]>(path, [])
  const { normalized, changed } = normalizeHistory(history)
  if (changed) await writeJson(path, normalized)
}

export const readHistory = async (path: string): Promise<HistoryMessage[]> => {
  const history = await readJson<HistoryMessage[]>(path, [])
  return normalizeHistory(history).normalized
}

export const writeHistory = async (
  path: string,
  messages: HistoryMessage[],
): Promise<void> => {
  const { normalized } = normalizeHistory(messages)
  await writeJson(path, normalized)
}

export const appendHistory = async (
  path: string,
  message: HistoryMessage,
): Promise<void> => {
  const history = await readHistory(path)
  history.push(message)
  await writeHistory(path, history)
}
