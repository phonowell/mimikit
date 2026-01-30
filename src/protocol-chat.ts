import { readFile, writeFile } from 'node:fs/promises'

import { withLock } from './protocol-utils.js'

import type { ProtocolPaths } from './protocol-paths.js'
import type { ChatMessage } from './protocol-types.js'

export const getChatHistory = async (
  paths: ProtocolPaths,
  limit = 50,
): Promise<ChatMessage[]> => {
  try {
    const data = await readFile(paths.chatHistoryPath, 'utf-8')
    const messages = JSON.parse(data) as ChatMessage[]
    return messages.slice(-limit)
  } catch {
    return []
  }
}

export const addChatMessage = async (
  paths: ProtocolPaths,
  message: ChatMessage,
): Promise<void> => {
  await withLock(paths.chatHistoryPath, async () => {
    const messages = await getChatHistory(paths, 1000)
    messages.push(message)
    const trimmed = messages.slice(-1000)
    await writeFile(paths.chatHistoryPath, JSON.stringify(trimmed, null, 2))
  })
}
