import { createQuoteBlock, isAgentMessage } from './render-shared.js'

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
  const roleClass = msg.role === 'manager' ? 'agent' : msg.role
  const isEntering = enterMessageIds?.has(msg?.id)
  item.className = `message ${roleClass}${isEntering ? ' message--enter' : ''}`
  if (msg?.id) item.dataset.messageId = String(msg.id)
  const canQuote = Boolean(onQuote && msg?.id)
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
      ) {
        return
      }
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
    content.classList.add('markdown')
    content.appendChild(renderMarkdown(text))
  } else {
    content.textContent = text
  }
  article.appendChild(content)

  const usageText = isAgentMessage(msg) ? formatUsage(msg.usage) : ''
  const elapsedText = isAgentMessage(msg) ? formatElapsedLabel(msg.elapsedMs) : ''
  const timeText = formatTime(msg.createdAt)
  const meta = document.createElement('small')
  meta.className = 'meta'
  if (usageText) {
    const usage = document.createElement('span')
    usage.className = 'usage'
    usage.textContent = usageText
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
    quoteBtn.className = 'btn btn--icon btn--icon-sm message-quote-btn'
    quoteBtn.textContent = msg.role === 'user' ? '↪' : '↩'
    quoteBtn.title = 'Quote'
    quoteBtn.setAttribute('aria-label', 'Quote')
    quoteBtn.addEventListener('click', () => onQuote(msg))
  }

  const time = document.createElement('span')
  time.className = 'time'
  time.textContent = timeText
  if (msg?.role === 'user' && ackedUserMessageIds?.has(String(msg.id))) {
    const delivery = document.createElement('span')
    delivery.className = 'delivery'
    delivery.textContent = '✓'
    delivery.title = 'Seen by agent'
    delivery.setAttribute('aria-label', 'Seen by agent')
    meta.appendChild(delivery)
  }
  meta.appendChild(time)
  article.appendChild(meta)

  item.appendChild(article)
  if (quoteBtn) item.appendChild(quoteBtn)
  messagesEl.appendChild(item)
}
