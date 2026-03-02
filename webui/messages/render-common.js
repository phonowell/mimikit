import { renderMessage } from './render-item.js'

export const preserveScrollPosition = ({
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

export const getCurrentStreamingItem = ({ messagesEl, streamingItemRef }) => {
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

export const canPromoteStreamItemToLatestAgent = ({
  existingStreamItem,
  latestAgent,
}) =>
  Boolean(
    existingStreamItem &&
      latestAgent?.id !== null &&
      latestAgent?.id !== undefined &&
      latestAgent?.role === 'agent' &&
      streamItemText(existingStreamItem) ===
        (typeof latestAgent.text === 'string' ? latestAgent.text : ''),
  )

export const promoteStreamItemFromTemplate = ({
  existingStreamItem,
  renderParams,
  msg,
  messagesEl,
}) => {
  const template = buildDetachedMessageItem(renderParams, msg)
  if (!template) return false
  syncItemFromTemplate(existingStreamItem, template)
  messagesEl.appendChild(existingStreamItem)
  return true
}

export const updateExistingStreamItem = ({
  streamItem,
  streamMessage,
  formatUsage,
}) => {
  const article = streamItem.querySelector('article')
  const content = article?.querySelector('.content')
  if (!article || !content) return false
  const nextText = typeof streamMessage?.text === 'string' ? streamMessage.text : ''
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
