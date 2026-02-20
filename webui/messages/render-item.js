import { createQuoteBlock, isAgentMessage } from './render-shared.js'
import { UI_TEXT } from '../system-text.js'

export const renderMessage = (params, msg) => {
  const {
    messagesEl,
    renderMarkdown,
    formatTime,
    formatUsage,
    formatElapsedLabel,
    enterMessageIds,
    onQuote,
    messageLookup,
    ackedUserMessageIds,
  } = params
  if (!messagesEl) return
  const item = document.createElement('li')
  const roleClass = msg.role === 'agent' ? 'agent' : msg.role
  const isSystemMessage = msg?.role === 'system'
  const isStreamingMessage = Boolean(msg?.streaming)
  const isEntering = enterMessageIds?.has(msg?.id)
  item.className = `message ${roleClass}${isStreamingMessage ? ' message--streaming' : ''}${isEntering ? ' message--enter' : ''}`
  if (msg?.id) item.dataset.messageId = String(msg.id)
  const canQuote = Boolean(onQuote && msg?.id && !isSystemMessage && !isStreamingMessage)
  if (canQuote) {
    item.classList.add('message--quoteable')
    item.tabIndex = 0
  }

  const article = document.createElement('article')
  if (canQuote) {
    article.addEventListener('dblclick', () => {
      if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 640px)').matches
      ) 
        return
      
      onQuote(msg)
    })
  }

  const content = document.createElement('div')
  content.className = 'content'
  const text = msg?.text ?? ''
  if (msg?.quote && messageLookup) {
    const quoteMessage = messageLookup.get(String(msg.quote))
    const quoteBlock = createQuoteBlock({ quoteId: msg.quote, quoteMessage, messagesEl })
    if (quoteBlock) article.appendChild(quoteBlock)
  }
  if (isAgentMessage(msg)) {
    if (isStreamingMessage) 
      content.textContent = text
     else {
      content.classList.add('markdown')
      content.appendChild(renderMarkdown(text))
    }
  } else 
    content.textContent = text
  
  article.appendChild(content)

  const usageDisplay = isAgentMessage(msg) ? formatUsage(msg.usage) : null
  const usageText = usageDisplay?.text ?? ''
  const elapsedText =
    isAgentMessage(msg) && !isStreamingMessage ? formatElapsedLabel(msg.elapsedMs) : ''
  const meta = document.createElement('small')
  meta.className = 'meta'
  if (usageText) {
    const usage = document.createElement('span')
    usage.className = 'usage'
    usage.textContent = usageText
    if (usageDisplay?.title) usage.title = usageDisplay.title
    meta.appendChild(usage)
  }
  if (elapsedText) {
    const elapsed = document.createElement('span')
    elapsed.className = 'elapsed'
    elapsed.textContent = usageText ? `· ${elapsedText}` : elapsedText
    meta.appendChild(elapsed)
  }

  let quoteBtn = null
  if (canQuote) {
    quoteBtn = document.createElement('button')
    quoteBtn.type = 'button'
    quoteBtn.className = 'btn btn--icon btn--icon-muted message-quote-btn'
    quoteBtn.textContent = msg.role === 'user' ? '↪' : '↩'
    quoteBtn.title = UI_TEXT.quote
    quoteBtn.setAttribute('aria-label', UI_TEXT.quote)
    quoteBtn.addEventListener('click', () => onQuote(msg))
  }

  if (msg?.role === 'user' && ackedUserMessageIds?.has(String(msg.id))) {
    const delivery = document.createElement('span')
    delivery.className = 'delivery'
    delivery.textContent = '✓'
    delivery.title = UI_TEXT.seenByAgent
    delivery.setAttribute('aria-label', UI_TEXT.seenByAgent)
    meta.appendChild(delivery)
  }
  if (!isSystemMessage && !isStreamingMessage) {
    const time = document.createElement('span')
    time.className = 'time'
    time.textContent = formatTime(msg.createdAt)
    meta.appendChild(time)
  }
  if (meta.childElementCount > 0) 
    article.appendChild(meta)
  

  item.appendChild(article)
  if (quoteBtn) item.appendChild(quoteBtn)
  messagesEl.appendChild(item)
}
