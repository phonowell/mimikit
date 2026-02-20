import {
  collectAckedUserMessageIds,
  findLatestAgentMessage,
  isAgentMessage,
} from './render-shared.js'
import { renderMessage } from './render-item.js'
import { formatUiError } from '../system-text.js'

export { collectAckedUserMessageIds, findLatestAgentMessage, isAgentMessage }

const preserveScrollPosition = ({
  messagesEl,
  wasNearBottom,
  previousScrollTop,
  previousScrollHeight,
  scrollToBottom,
}) => {
  const newScrollHeight = messagesEl.scrollHeight
  if (wasNearBottom) {
    scrollToBottom({ smooth: false })
    return
  }
  const delta = newScrollHeight - previousScrollHeight
  const nextTop = previousScrollTop + delta
  messagesEl.scrollTop = nextTop < 0 ? 0 : nextTop
}

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
  } = params
  if (!messagesEl || ((!messages || messages.length === 0) && !streamMessage))
    return { latestAgentId: null, lastRole: null }
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
  
  const ackedUserMessageIds = collectAckedUserMessageIds(safeMessages)
  const latestAgentId =
    latestAgent?.id !== null && latestAgent?.id !== undefined
      ? String(latestAgent.id)
      : null
  const renderParams = {
    ...params,
    messageLookup,
    ackedUserMessageIds,
    latestAgentId,
  }
  for (const msg of safeMessages) 
    renderMessage(renderParams, msg)
  
  if (streamMessage) renderMessage(renderParams, streamMessage)

  if (loading?.isLoading()) loading.ensureLoadingPlaceholder()
  preserveScrollPosition({
    messagesEl,
    wasNearBottom,
    previousScrollTop,
    previousScrollHeight,
    scrollToBottom,
  })
  updateScrollButton()

  const last = streamMessage ?? safeMessages[safeMessages.length - 1]
  return {
    latestAgentId: latestAgent?.id ?? null,
    lastRole: last?.role ?? null,
  }
}

export const renderStreamMessage = (params) => {
  const {
    streamMessage,
    messagesEl,
    removeEmpty,
    isNearBottom,
    scrollToBottom,
    updateScrollButton,
  } = params
  if (!messagesEl) return
  removeEmpty()
  const wasNearBottom = isNearBottom()
  const previousScrollTop = messagesEl.scrollTop
  const previousScrollHeight = messagesEl.scrollHeight
  const existingStreamItems = messagesEl.querySelectorAll('.message--streaming')
  for (const item of existingStreamItems) item.remove()
  if (streamMessage) {
    renderMessage(
      {
        ...params,
        messageLookup: new Map(),
        ackedUserMessageIds: new Set(),
        latestAgentId: null,
      },
      streamMessage,
    )
  }
  preserveScrollPosition({
    messagesEl,
    wasNearBottom,
    previousScrollTop,
    previousScrollHeight,
    scrollToBottom,
  })
  updateScrollButton()
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
