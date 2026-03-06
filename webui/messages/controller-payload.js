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

const findNewManagerFallbackMessage = (messages, enterMessageIds) => {
  if (!enterMessageIds || enterMessageIds.size === 0) return null
  for (const message of messages) {
    if (!message?.id || !enterMessageIds.has(message.id)) continue
    if (
      message.role === 'system' &&
      message.systemEventName === 'manager_fallback_reply'
    )
      return message
  }
  return null
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
      const fallbackMessage = findNewManagerFallbackMessage(
        messages,
        enterMessageIds,
      )
      if (fallbackMessage) {
        const payload = fallbackMessage.systemEventPayload ?? {}
        console.warn('[webui] manager fallback received', {
          messageId: fallbackMessage.id,
          autoRetryAttempts:
            typeof payload.auto_retry_attempts === 'number'
              ? payload.auto_retry_attempts
              : 0,
          autoRetryMaxAttempts:
            typeof payload.auto_retry_max_attempts === 'number'
              ? payload.auto_retry_max_attempts
              : 0,
          autoRetryState:
            typeof payload.auto_retry_state === 'string'
              ? payload.auto_retry_state
              : 'unknown',
          autoRetryStrategy:
            typeof payload.auto_retry_strategy === 'string'
              ? payload.auto_retry_strategy
              : 'unspecified',
        })
        messageState.awaitingReply = false
        loading.setLoading(false)
      }
      const rendered = doRender(messages, enterMessageIds)
      if (rendered)
        applyRenderedState(messageState, rendered, { loading, syncLoadingState })
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
