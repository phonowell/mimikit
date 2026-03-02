import {
  applyRenderedState,
  collectNewMessageIds,
  hasLoadingVisibilityChange,
  hasMessageChange,
  hasStreamChange,
  updateLoadingVisibilityState,
  updateMessageState,
  updateStreamState,
} from './state.js'
import { mergeIncomingMessages } from './controller-status.js'
import { isRecord, normalizeStreamMessage } from './controller-stream.js'

const MESSAGE_LIMIT = 50

export const createPayloadController = ({
  messageState,
  loading,
  doRender,
  doRenderStream,
  syncLoadingState,
  updateStatus,
  onTasksSnapshot,
  onPlansSnapshot,
  onFocusesSnapshot,
  onChoiceSnapshot,
  getCurrentStreamMessage,
  setCurrentStreamMessage,
}) => {
  const applyMessagesPayload = (msgData, streamMessage) => {
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
    if (streamMessage) {
      messageState.awaitingReply = false
      loading.setLoading(false)
    }
    const newestId = messages.length > 0 ? messages[messages.length - 1].id : null
    const loadingVisible = loading.isLoading()
    const messageChanged = hasMessageChange(messageState, messages, newestId)
    const loadingChanged = hasLoadingVisibilityChange(messageState, loadingVisible)
    const streamChanged = hasStreamChange(messageState, streamMessage)
    const changed = messageChanged || loadingChanged || streamChanged
    if (messageChanged || loadingChanged) {
      const enterMessageIds = collectNewMessageIds(messageState, messages)
      const rendered = doRender(messages, enterMessageIds, streamMessage)
      if (rendered)
        applyRenderedState(messageState, rendered, { loading, syncLoadingState })
    } else if (streamChanged) doRenderStream(streamMessage)

    updateMessageState(messageState, messages, newestId)
    updateLoadingVisibilityState(messageState, loading.isLoading())
    updateStreamState(messageState, streamMessage)
    return changed
  }

  const applySnapshot = (snapshot) => {
    if (!isRecord(snapshot)) return
    const streamPayload = isRecord(snapshot.stream) ? snapshot.stream : null
    const currentStreamMessage = normalizeStreamMessage(streamPayload)
    setCurrentStreamMessage(currentStreamMessage)
    if (isRecord(snapshot.status)) updateStatus(snapshot.status)
    else syncLoadingState()
    applyMessagesPayload(snapshot.messages, currentStreamMessage)
    if (typeof onTasksSnapshot === 'function' && isRecord(snapshot.tasks))
      onTasksSnapshot(snapshot.tasks)
    if (typeof onPlansSnapshot === 'function' && isRecord(snapshot.plans))
      onPlansSnapshot(snapshot.plans)
    if (typeof onFocusesSnapshot === 'function' && isRecord(snapshot.focuses))
      onFocusesSnapshot(snapshot.focuses)
    if (typeof onChoiceSnapshot === 'function')
      onChoiceSnapshot(snapshot.choice ?? null)
  }

  return {
    applyMessagesPayload,
    applySnapshot,
    getCurrentStreamMessage,
  }
}
