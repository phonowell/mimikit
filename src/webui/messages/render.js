import {
  collectAckedUserMessageIds,
  findLatestAgentMessage,
  isAgentMessage,
} from './render-shared.js'
import { renderMessage } from './render-item.js'
import { formatUiError } from '../system-text.js'

export { collectAckedUserMessageIds, findLatestAgentMessage, isAgentMessage }

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
  if (!messagesEl || !messages || messages.length === 0)
    return { latestAgentId: null, lastRole: null, lastIsAgent: false }
  removeEmpty()
  const latestAgent = findLatestAgentMessage(messages)
  const wasNearBottom = isNearBottom()
  const previousScrollTop = messagesEl.scrollTop
  const previousScrollHeight = messagesEl.scrollHeight
  messagesEl.innerHTML = ''

  const messageLookup = new Map()
  for (const msg of messages) {
    if (msg?.id) messageLookup.set(String(msg.id), msg)
  }
  const ackedUserMessageIds = collectAckedUserMessageIds(messages)
  const renderParams = { ...params, messageLookup, ackedUserMessageIds }
  for (const msg of messages) {
    renderMessage(renderParams, msg)
  }

  if (loading?.isLoading()) loading.ensureLoadingPlaceholder()
  const newScrollHeight = messagesEl.scrollHeight
  if (wasNearBottom) {
    scrollToBottom({ smooth: false })
  } else {
    const delta = newScrollHeight - previousScrollHeight
    const nextTop = previousScrollTop + delta
    messagesEl.scrollTop = nextTop < 0 ? 0 : nextTop
  }
  updateScrollButton()

  const last = messages[messages.length - 1]
  return {
    latestAgentId: latestAgent?.id ?? null,
    lastRole: last?.role ?? null,
    lastIsAgent: last ? isAgentMessage(last) : false,
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
