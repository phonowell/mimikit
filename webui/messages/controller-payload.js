import {
  applyRenderedState,
  collectNewMessageIds,
  hasLoadingVisibilityChange,
  hasMessageChange,
  updateLoadingVisibilityState,
  updateMessageState,
} from './state.js'
import { mergeIncomingMessages } from './controller-status.js'
import { isRecord } from '../value.js'

const MESSAGE_LIMIT = 50

const hasNewManagerFallbackMessage = (messages, enterMessageIds) => {
  if (!enterMessageIds || enterMessageIds.size === 0) return false
  for (const message of messages) {
    if (!message?.id || !enterMessageIds.has(message.id)) continue
    if (
      message.role === 'system' &&
      message.systemEventName === 'manager_fallback_reply'
    )
      return true
  }
  return false
}

const findNewAgentMessages = (messages, enterMessageIds) => {
  if (!enterMessageIds || enterMessageIds.size === 0) return []
  const items = []
  for (const message of messages) {
    if (!message?.id || !enterMessageIds.has(message.id)) continue
    if (message.role === 'agent') items.push(message)
  }
  return items
}

export const createPayloadController = ({
  messageState,
  loading,
  doRender,
  syncLoadingState,
  updateStatus,
  onTasksSnapshot,
  onPlansSnapshot,
  onFocusesSnapshot,
  onChoiceSnapshot,
  onAgentMessages,
}) => {
  const applyMessagesPayload = (msgData) => {
    const hasMessagesPayload = isRecord(msgData)
    const incoming =
      hasMessagesPayload && Array.isArray(msgData.messages) ? msgData.messages : []
    const mode =
      hasMessagesPayload && typeof msgData.mode === 'string' ? msgData.mode : 'full'
    const messages = hasMessagesPayload
      ? mergeIncomingMessages({
          mode,
          lastMessages: messageState.lastMessages,
          incoming,
          limit: MESSAGE_LIMIT,
        })
      : messageState.lastMessages
    const loadingVisible = loading.isLoading()
    const messageChanged = hasMessageChange(messageState, messages)
    const loadingChanged = hasLoadingVisibilityChange(messageState, loadingVisible)
    const changed = messageChanged || loadingChanged
    if (messageChanged || loadingChanged) {
      const enterMessageIds = collectNewMessageIds(messageState, messages)
      if (hasNewManagerFallbackMessage(messages, enterMessageIds)) {
        messageState.awaitingReply = false
        loading.setLoading(false)
      }
      const rendered = doRender(messages, enterMessageIds)
      if (rendered)
        applyRenderedState(messageState, rendered, { loading, syncLoadingState })
      const newAgentMessages = findNewAgentMessages(messages, enterMessageIds)
      if (newAgentMessages.length > 0 && typeof onAgentMessages === 'function')
        onAgentMessages(newAgentMessages)
    }

    updateMessageState(messageState, messages)
    updateLoadingVisibilityState(messageState, loading.isLoading())
    return changed
  }

  const applyTasksSnapshot = (tasks) => {
    if (typeof onTasksSnapshot === 'function' && isRecord(tasks))
      onTasksSnapshot(tasks)
  }

  const applySnapshot = (snapshot) => {
    if (!isRecord(snapshot)) return
    if (isRecord(snapshot.status)) updateStatus(snapshot.status)
    else syncLoadingState()
    applyMessagesPayload(snapshot.messages)
    applyTasksSnapshot(snapshot.tasks)
    if (typeof onPlansSnapshot === 'function' && isRecord(snapshot.plans))
      onPlansSnapshot(snapshot.plans)
    if (typeof onFocusesSnapshot === 'function' && isRecord(snapshot.focuses))
      onFocusesSnapshot(snapshot.focuses)
    if (typeof onChoiceSnapshot === 'function')
      onChoiceSnapshot(snapshot.choice ?? null)
  }

  return {
    applyMessagesPayload,
    applyTasksSnapshot,
    applySnapshot,
  }
}
