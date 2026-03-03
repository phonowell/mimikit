import { renderMarkdown } from '../markdown.js'

import { formatDisplayTimeWithFull } from './format-time.js'
import { formatElapsedLabel, formatUsage } from './format-usage.js'
import { renderMessages } from './render-list.js'
import { renderStreamMessage } from './render-stream.js'

export const createMessageRendering = (params) => {
  const { messagesEl, scroll, loading, quote, onDelete, isDeleteMode } = params

  const removeEmpty = () => {}
  const streamingItemRef = { current: null }

  const doRender = (messages, enterMessageIds, streamMessage) => {
    if (!messages?.length && !streamMessage) {
      streamingItemRef.current = null
      return null
    }
    return renderMessages({
      messages,
      messagesEl,
      removeEmpty,
      renderMarkdown,
      formatDisplayTimeWithFull,
      formatUsage,
      formatElapsedLabel,
      isNearBottom: scroll.isNearBottom,
      scrollToBottom: scroll.scrollToBottom,
      updateScrollButton: scroll.updateScrollButton,
      loading,
      enterMessageIds,
      onQuote: quote.set,
      onDelete,
      isDeleteMode: typeof isDeleteMode === 'function' ? isDeleteMode() : Boolean(isDeleteMode),
      streamMessage,
      streamingItemRef,
    })
  }

  const doRenderStream = (streamMessage) => {
    renderStreamMessage({
      messagesEl,
      removeEmpty,
      renderMarkdown,
      formatDisplayTimeWithFull,
      formatUsage,
      formatElapsedLabel,
      isNearBottom: scroll.isNearBottom,
      scrollToBottom: scroll.scrollToBottom,
      updateScrollButton: scroll.updateScrollButton,
      loading,
      enterMessageIds: new Set(),
      onQuote: quote.set,
      onDelete,
      isDeleteMode: typeof isDeleteMode === 'function' ? isDeleteMode() : Boolean(isDeleteMode),
      streamMessage,
      streamingItemRef,
    })
  }

  return {
    removeEmpty,
    doRender,
    doRenderStream,
  }
}
