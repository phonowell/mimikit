import { findLatestAgentMessage } from './render-shared.js'
import { renderMessage } from './render-item.js'
import { formatUiError } from '../system-text.js'

const preserveScrollPosition = ({
  messagesEl,
  wasNearBottom,
  previousScrollTop,
  previousScrollHeight,
  scrollToBottom,
}) => {
  const newScrollHeight = messagesEl.scrollHeight
  const delta = newScrollHeight - previousScrollHeight
  if (wasNearBottom && delta > 0) {
    scrollToBottom({ smooth: false })
    return
  }
  const nextTop = previousScrollTop + delta
  messagesEl.scrollTop = nextTop < 0 ? 0 : nextTop
}

export const renderMessages = (params) => {
  const {
    messages,
    messagesEl,
    removeEmpty,
    isNearBottom,
    scrollToBottom,
    updateScrollButton,
    loading,
  } = params
  if (!messagesEl) return { latestAgentId: null }
  if (!messages || messages.length === 0) {
    messagesEl.replaceChildren()
    updateScrollButton()
    return { latestAgentId: null }
  }

  removeEmpty()
  const safeMessages = Array.isArray(messages) ? messages : []
  const latestAgent = findLatestAgentMessage(safeMessages)
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
    renderMessage(renderParams, msg)
  }

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
