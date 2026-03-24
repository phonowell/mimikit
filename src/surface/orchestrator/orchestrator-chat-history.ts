import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { readHistory, rewriteHistory } from '../../persistence/history/store.js'
import { appendLog } from '../../persistence/log/append.js'
import {
  mergeChatMessages,
  selectChatMessages,
} from '../read-model/chat-view.js'

import type { SurfaceRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { ChatMessage, ChatMessagesMode } from '../read-model/chat-view.js'

const DELETED_MESSAGE_TEXT = 'Message deleted.'

export type DeleteChatMessageResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not_found' | 'not_allowed' }

export const getChatMessagesSnapshot = async (
  runtime: SurfaceRuntime,
  limit = 50,
  afterId?: string,
): Promise<{ messages: ChatMessage[]; mode: ChatMessagesMode }> => {
  const history = await readHistory(runtime.paths.history)
  return selectChatMessages({
    history,
    inflightInputs: [...runtime.session.inflightInputs],
    limit,
    ...(afterId ? { afterId } : {}),
  })
}

export const getChatHistorySnapshot = async (
  runtime: SurfaceRuntime,
  limit = 50,
): Promise<ChatMessage[]> => {
  const history = await readHistory(runtime.paths.history)
  return mergeChatMessages({
    history,
    inflightInputs: [...runtime.session.inflightInputs],
    limit,
  })
}

export const deleteChatHistoryMessage = async (
  runtime: SurfaceRuntime,
  messageId: string,
): Promise<DeleteChatMessageResult> => {
  const id = messageId.trim()
  if (!id) return { ok: false, reason: 'not_found' }
  const history = await readHistory(runtime.paths.history)
  const targetIndex = history.findIndex((message) => message.id === id)
  if (targetIndex < 0) return { ok: false, reason: 'not_found' }
  const target = history[targetIndex]
  if (!target) return { ok: false, reason: 'not_found' }
  if (target.role === 'system') return { ok: false, reason: 'not_allowed' }
  const nextHistory = [...history]
  nextHistory[targetIndex] = {
    id: target.id,
    role: 'system' as const,
    visibility: 'user' as const,
    text: DELETED_MESSAGE_TEXT,
    createdAt: target.createdAt,
    focusId: target.focusId,
  }
  await rewriteHistory(runtime.paths.history, nextHistory)
  await appendLog(runtime.paths.log, {
    event: 'message_deleted',
    id,
    role: target.role,
  })
  notifyUiSignal(runtime, 'messages')
  return { ok: true, id }
}
