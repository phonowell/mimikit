import { renderMessage } from './render-item.js'
import {
  getCurrentStreamingItem,
  preserveScrollPosition,
  updateExistingStreamItem,
} from './render-common.js'

export const renderStreamMessage = (params) => {
  const {
    streamMessage,
    messagesEl,
    removeEmpty,
    isNearBottom,
    scrollToBottom,
    updateScrollButton,
    formatUsage,
    streamingItemRef,
  } = params
  if (!messagesEl) return

  removeEmpty()
  const wasNearBottom = isNearBottom()
  const previousScrollTop = messagesEl.scrollTop
  const previousScrollHeight = messagesEl.scrollHeight
  const existingStreamItem = getCurrentStreamingItem({
    messagesEl,
    streamingItemRef,
  })
  const freezeExistingStreamItem = () => {
    if (!existingStreamItem) return
    existingStreamItem.classList.remove('message--streaming')
  }

  if (!streamMessage) {
    freezeExistingStreamItem()
    if (streamingItemRef) streamingItemRef.current = null
    preserveScrollPosition({
      messagesEl,
      wasNearBottom,
      previousScrollTop,
      previousScrollHeight,
      scrollToBottom,
    })
    updateScrollButton()
    return
  }

  if (
    existingStreamItem &&
    existingStreamItem.dataset.messageId === String(streamMessage.id)
  ) {
    const updated = updateExistingStreamItem({
      streamItem: existingStreamItem,
      streamMessage,
      formatUsage,
    })
    if (updated) {
      preserveScrollPosition({
        messagesEl,
        wasNearBottom,
        previousScrollTop,
        previousScrollHeight,
        scrollToBottom,
      })
      updateScrollButton()
      return
    }
    existingStreamItem.remove()
  } else if (existingStreamItem) freezeExistingStreamItem()

  const streamItem = renderMessage(
    {
      ...params,
      messageLookup: new Map(),
      ackedUserMessageIds: new Set(),
      latestAgentId: null,
    },
    streamMessage,
  )
  if (streamingItemRef) streamingItemRef.current = streamItem

  preserveScrollPosition({
    messagesEl,
    wasNearBottom,
    previousScrollTop,
    previousScrollHeight,
    scrollToBottom,
  })
  updateScrollButton()
}
