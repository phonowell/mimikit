import { UI_TEXT, formatHttpFailure } from '../system-text.js'

export const createMessageFetchers = (params) => {
  const {
    messageState,
    loading,
    doRender,
    onStatusUpdate,
    onStatusStale,
    setDisconnected,
    getMessagesUrl,
    getStatusUrl,
    getMessageEtag,
    setMessageEtag,
    getStatusEtag,
    setStatusEtag,
    getLastMessageCursor,
    setLastMessageCursor,
    collectNewMessageIds,
    hasMessageChange,
    hasLoadingVisibilityChange,
    updateMessageState,
    updateLoadingVisibilityState,
    applyRenderedState,
    syncLoadingState,
    mergeIncomingMessages,
  } = params

  const readErrorMessage = async (response, fallback) => {
    try {
      const data = await response.json()
      if (data && typeof data.error === 'string' && data.error.trim()) {
        return data.error
      }
    } catch {
      return formatHttpFailure(fallback, response.status)
    }
    return formatHttpFailure(fallback, response.status)
  }

  const fetchMessages = async () => {
    const headers = {}
    const etag = getMessageEtag()
    if (etag) headers['If-None-Match'] = etag
    const msgRes = await fetch(getMessagesUrl(), { headers })
    if (msgRes.status === 304) return null
    if (!msgRes.ok) {
      throw new Error(await readErrorMessage(msgRes, UI_TEXT.fetchMessagesFailed))
    }
    const nextEtag = msgRes.headers.get('etag')
    if (nextEtag) setMessageEtag(nextEtag)
    return msgRes.json()
  }

  const fetchStatus = async () => {
    const headers = {}
    const etag = getStatusEtag()
    if (etag) headers['If-None-Match'] = etag
    const statusRes = await fetch(getStatusUrl(), { headers })
    if (statusRes.status === 304) return null
    if (!statusRes.ok) {
      throw new Error(await readErrorMessage(statusRes, UI_TEXT.fetchStatusFailed))
    }
    const nextEtag = statusRes.headers.get('etag')
    if (nextEtag) setStatusEtag(nextEtag)
    return statusRes.json()
  }

  const applyMessageData = (msgData) => {
    if (msgData === null) {
      updateLoadingVisibilityState(messageState, loading.isLoading())
      return false
    }
    const incoming = msgData.messages || []
    const mode = msgData && typeof msgData.mode === 'string' ? msgData.mode : 'full'
    const messages = mergeIncomingMessages(incoming, mode)
    const newestId = messages.length > 0 ? messages[messages.length - 1].id : null
    const loadingVisible = loading.isLoading()
    const changed =
      hasMessageChange(messageState, messages, newestId) ||
      hasLoadingVisibilityChange(messageState, loadingVisible)
    if (changed) {
      const enterMessageIds = collectNewMessageIds(messageState, messages)
      const rendered = doRender(messages, enterMessageIds)
      if (rendered)
        applyRenderedState(messageState, rendered, { loading, syncLoadingState })
    }
    updateMessageState(messageState, messages, newestId)
    setLastMessageCursor(newestId)
    updateLoadingVisibilityState(messageState, loading.isLoading())
    return changed
  }

  const fetchAndRenderMessages = async () => {
    const msgData = await fetchMessages()
    return applyMessageData(msgData)
  }

  const pollOnce = async () => {
    const [statusRes, msgRes] = await Promise.all([fetchStatus(), fetchMessages()])
    if (statusRes !== null) onStatusUpdate(statusRes)
    else onStatusStale()
    if (msgRes !== null) {
      applyMessageData(msgRes)
      return
    }
    syncLoadingState()
  }

  return {
    fetchAndRenderMessages,
    pollOnce,
    setDisconnected,
    getLastMessageCursor,
  }
}
