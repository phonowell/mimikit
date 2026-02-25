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

const streamItemText = (streamItem) => {
  if (!streamItem) return ''
  const content = streamItem.querySelector('article .content')
  if (!content) return ''
  return content.textContent ?? ''
}

const buildDetachedMessageItem = (renderParams, msg) => {
  const appendTarget = document.createDocumentFragment()
  return renderMessage({ ...renderParams, appendTarget }, msg)
}

const syncItemFromTemplate = (target, template) => {
  const normalizedClassName = template.className.replace(/\smessage--enter\b/g, '')
  target.className = normalizedClassName
  if (template.dataset.messageId) target.dataset.messageId = template.dataset.messageId
  else delete target.dataset.messageId
  target.replaceChildren(...template.childNodes)
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
    streamingItemRef,
  } = params
  if (!messagesEl || ((!messages || messages.length === 0) && !streamMessage))
    return { latestAgentId: null }
  removeEmpty()
  const safeMessages = Array.isArray(messages) ? messages : []
  const latestAgent = findLatestAgentMessage(safeMessages)
  const existingStreamItem =
    streamMessage === null || streamMessage === undefined
      ? getCurrentStreamingItem({
          messagesEl,
          streamingItemRef,
        })
      : null
  const canPromoteStreamItem =
    existingStreamItem &&
    latestAgent?.id !== null &&
    latestAgent?.id !== undefined &&
    latestAgent?.role === 'agent' &&
    streamItemText(existingStreamItem) ===
      (typeof latestAgent.text === 'string' ? latestAgent.text : '')
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
  for (const msg of safeMessages) {
    const shouldPromoteStreamItem =
      Boolean(canPromoteStreamItem) &&
      latestAgentId !== null &&
      msg?.id !== null &&
      msg?.id !== undefined &&
      String(msg.id) === latestAgentId
    if (shouldPromoteStreamItem && existingStreamItem) {
      const template = buildDetachedMessageItem(renderParams, msg)
      if (template) {
        syncItemFromTemplate(existingStreamItem, template)
        messagesEl.appendChild(existingStreamItem)
        continue
      }
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

const getCurrentStreamingItem = ({ messagesEl, streamingItemRef }) => {
  const cachedItem = streamingItemRef?.current ?? null
  if (
    cachedItem &&
    cachedItem.parentElement === messagesEl &&
    cachedItem.classList?.contains('message--streaming')
  )
    return cachedItem

  const fallback = messagesEl.querySelector('.message--streaming')
  const nextItem = fallback || null
  if (streamingItemRef) streamingItemRef.current = nextItem
  return nextItem
}

const updateExistingStreamItem = ({
  streamItem,
  streamMessage,
  formatUsage,
}) => {
  const article = streamItem.querySelector('article')
  const content = article?.querySelector('.content')
  if (!article || !content) return false
  const nextText =
    typeof streamMessage?.text === 'string' ? streamMessage.text : ''
  if (content.textContent !== nextText) content.textContent = nextText

  const existingMeta = article.querySelector('small.meta')
  if (existingMeta) existingMeta.remove()
  const usageDisplay = formatUsage(streamMessage?.usage)
  if (usageDisplay?.text) {
    const meta = document.createElement('small')
    meta.className = 'meta'
    const usage = document.createElement('span')
    usage.className = 'usage'
    usage.textContent = usageDisplay.text
    if (usageDisplay.title) usage.title = usageDisplay.title
    meta.appendChild(usage)
    article.appendChild(meta)
  }
  return true
}

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
  if (!streamMessage) {
    if (existingStreamItem) existingStreamItem.remove()
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
  } else if (existingStreamItem) 
    existingStreamItem.remove()
  

  const streamItem = renderMessage(
    {
      ...params,
      messageLookup: new Map(),
      ackedUserMessageIds: new Set(),
      latestAgentId: null,
    },
    streamMessage,
  )
  if (streamingItemRef) 
    streamingItemRef.current = streamItem
  
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
