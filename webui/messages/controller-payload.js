import {
  applyRenderedState,
  collectNewMessageIds,
  hasLoadingVisibilityChange,
  hasMessageChange,
  updateLoadingVisibilityState,
  updateMessageState,
} from './state.js'
import { mergeIncomingMessages } from './controller-status.js'
import { createIngressLogger } from './ingress-log.js'
import { isRecord } from '../value.js'

const MESSAGE_LIMIT = 50

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
  const ingressLogger = createIngressLogger()

  const applyMessagesPayload = (msgData) => {
    const hasMessagesPayload = isRecord(msgData)
    const incoming =
      hasMessagesPayload && Array.isArray(msgData.messages) ? msgData.messages : []
    const mode =
      hasMessagesPayload && typeof msgData.mode === 'string' ? msgData.mode : 'full'
    ingressLogger.logIncomingMessages({ mode, incoming })
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
