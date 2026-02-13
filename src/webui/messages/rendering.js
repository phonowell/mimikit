import { renderMarkdown } from '../markdown.js'

import { formatElapsedLabel, formatTime, formatUsage } from './format.js'
import { renderMessages } from './render.js'

export const createMessageRendering = (params) => {
  const { messagesEl, scroll, loading, quote } = params

  const removeEmpty = () => {}

  const doRender = (messages, enterMessageIds) => {
    if (!messages?.length) return null
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
    })
  }

  return {
    removeEmpty,
    doRender,
  }
}
