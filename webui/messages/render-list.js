import { findLatestAgentMessage } from './render-shared.js'
import { renderMessage } from './render-item.js'
import {
  canPromoteStreamItemToLatestAgent,
  getCurrentStreamingItem,
  preserveScrollPosition,
  promoteStreamItemFromTemplate,
} from './render-common.js'
import { formatUiError } from '../system-text.js'

export const renderMessages = (params) => {
  const {
    messages,
    streamMessage,
    messagesEl,
    removeEmpty,
    isNearBottom,
    scrollToBottom,
    updateScrollButton,
    loading,
    streamingItemRef,
  } = params
  if (!messagesEl) return { latestAgentId: null }
  if ((!messages || messages.length === 0) && !streamMessage) {
    messagesEl.replaceChildren()
    if (streamingItemRef) streamingItemRef.current = null
    updateScrollButton()
    return { latestAgentId: null }
  }

  removeEmpty()
  const safeMessages = Array.isArray(messages) ? messages : []
  const latestAgent = findLatestAgentMessage(safeMessages)
  const existingStreamItem =
    streamMessage === null || streamMessage === undefined
      ? getCurrentStreamingItem({ messagesEl, streamingItemRef })
      : null
  const canPromoteStreamItem = canPromoteStreamItemToLatestAgent({
    existingStreamItem,
    latestAgent,
  })
  const wasNearBottom = isNearBottom()
  const previousScrollTop = messagesEl.scrollTop
  const previousScrollHeight = messagesEl.scrollHeight
  messagesEl.innerHTML = ''

  const messageLookup = new Map()
  for (const msg of safeMessages)
    if (msg?.id) messageLookup.set(String(msg.id), msg)

  const latestAgentId =
    latestAgent?.id !== null && latestAgent?.id !== undefined
      ? String(latestAgent.id)
      : null
  const renderParams = {
    ...params,
    messageLookup,
    latestAgentId,
  }

  for (const msg of safeMessages) {
    const shouldPromoteStreamItem =
      Boolean(canPromoteStreamItem) &&
      latestAgentId !== null &&
      msg?.id !== null &&
      msg?.id !== undefined &&
      String(msg.id) === latestAgentId
    if (shouldPromoteStreamItem && existingStreamItem) {
      const promoted = promoteStreamItemFromTemplate({
        existingStreamItem,
        renderParams,
        msg,
        messagesEl,
      })
      if (promoted) continue
    }
    renderMessage(renderParams, msg)
  }

  if (streamMessage) {
    const streamItem = renderMessage(renderParams, streamMessage)
    if (streamingItemRef) streamingItemRef.current = streamItem
  } else if (streamingItemRef) streamingItemRef.current = null

  if (loading?.isLoading()) loading.ensureLoadingPlaceholder()
  preserveScrollPosition({
    messagesEl,
    wasNearBottom,
    previousScrollTop,
    previousScrollHeight,
    scrollToBottom,
  })
  updateScrollButton()

  return {
    latestAgentId: latestAgent?.id ?? null,
  }
}

export const renderError = (params, error) => {
  const { messagesEl, removeEmpty, updateScrollButton } = params
  if (!messagesEl) return
  removeEmpty()
  const item = document.createElement('li')
  item.className = 'message system'
  const article = document.createElement('article')
  const message = error instanceof Error ? error.message : String(error)
  article.textContent = formatUiError(message)
  item.appendChild(article)
  messagesEl.appendChild(item)
  updateScrollButton()
}
