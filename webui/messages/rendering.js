import { renderMarkdown } from '../markdown.js'

import { formatElapsedLabel, formatTime, formatUsage } from './format.js'
import { renderMessages, renderStreamMessage } from './render.js'

export const createMessageRendering = (params) => {
  const { messagesEl, scroll, loading, quote } = params

  const removeEmpty = () => {}

  const doRender = (messages, enterMessageIds, streamMessage) => {
    if (!messages?.length && !streamMessage) return null
    return renderMessages({
      messages,
      messagesEl,
      removeEmpty,
      renderMarkdown,
      formatTime,
      formatUsage,
      formatElapsedLabel,
      isNearBottom: scroll.isNearBottom,
      scrollToBottom: scroll.scrollToBottom,
      updateScrollButton: scroll.updateScrollButton,
      loading,
      enterMessageIds,
      onQuote: quote.set,
      streamMessage,
    })
  }

  const doRenderStream = (streamMessage) => {
    renderStreamMessage({
      messagesEl,
      removeEmpty,
      renderMarkdown,
      formatTime,
      formatUsage,
      formatElapsedLabel,
      isNearBottom: scroll.isNearBottom,
      scrollToBottom: scroll.scrollToBottom,
      updateScrollButton: scroll.updateScrollButton,
      loading,
      enterMessageIds: new Set(),
      onQuote: quote.set,
      streamMessage,
    })
  }

  return {
    removeEmpty,
    doRender,
    doRenderStream,
  }
}
