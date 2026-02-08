import { createMessageFetchers } from './polling.js'
import { buildMessagesUrl, mergeIncomingMessages } from './controller-status.js'

export const createControllerPolling = (params) => {
  const {
    messageState,
    loading,
    notifications,
    doRender,
    updateStatus,
    syncLoadingState,
    setDisconnected,
    cursors,
    collectNewMessageIds,
    hasMessageChange,
    hasLoadingVisibilityChange,
    updateMessageState,
    updateLoadingVisibilityState,
    applyRenderedState,
    messageLimit,
  } = params

  return createMessageFetchers({
    messageState,
    loading,
    notifications,
    doRender,
    onStatusUpdate: updateStatus,
    onStatusStale: syncLoadingState,
    setDisconnected,
    getMessagesUrl: () =>
      buildMessagesUrl({ cursor: cursors.message.get(), limit: messageLimit }),
    getStatusUrl: () => '/api/status',
    getMessageEtag: () => cursors.messagesEtag.get(),
    setMessageEtag: (etag) => {
      cursors.messagesEtag.set(etag)
    },
    getStatusEtag: () => cursors.statusEtag.get(),
    setStatusEtag: (etag) => {
      cursors.statusEtag.set(etag)
    },
    getLastMessageCursor: () => cursors.message.get(),
    setLastMessageCursor: (cursor) => {
      cursors.message.set(cursor)
    },
    collectNewMessageIds,
    hasMessageChange,
    hasLoadingVisibilityChange,
    updateMessageState,
    updateLoadingVisibilityState,
    applyRenderedState,
    syncLoadingState,
    mergeIncomingMessages: (incoming, mode) =>
      mergeIncomingMessages({
        mode,
        lastMessages: messageState.lastMessages,
        incoming,
        limit: messageLimit,
      }),
  })
}
