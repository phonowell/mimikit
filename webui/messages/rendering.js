import { renderMarkdown } from '../markdown.js'

import { formatDisplayTimeWithFull } from './format-time.js'
import { formatElapsedLabel, formatUsage } from './format-usage.js'
import { renderMessages } from './render-list.js'

export const createMessageRendering = (params) => {
  const {
    messagesEl,
    scroll,
    loading,
    quote,
    onDelete,
    onInspectAction,
    isDeleteMode,
  } = params
  const removeEmpty = () => {}

  const doRender = (messages, enterMessageIds) => {
    if (!messages?.length) return null
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
      onInspectAction,
      isDeleteMode:
        typeof isDeleteMode === 'function' ? isDeleteMode() : Boolean(isDeleteMode),
    })
  }

  return {
    removeEmpty,
    doRender,
  }
}
