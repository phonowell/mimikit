export const isAgentMessage = (msg) => msg?.role === 'manager'

export const findLatestAgentMessage = (messages) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (isAgentMessage(msg)) return msg
  }
  return null
}

const normalizeRole = (role) => {
  if (role === 'manager') return 'agent'
  if (role === 'user') return 'user'
  if (role === 'system') return 'system'
  return 'unknown'
}

const formatRoleLabel = (role) => {
  const normalized = normalizeRole(role)
  if (normalized === 'user') return 'You'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'system') return 'System'
  return 'Quoted message'
}

const cleanText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim()

const formatQuotePreview = (text) => {
  const cleaned = cleanText(text)
  if (!cleaned) return ''
  const max = 140
  return cleaned.length > max ? `${cleaned.slice(0, max)}...` : cleaned
}

const escapeSelectorValue = (value) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}

const flashMessage = (target) => {
  target.classList.remove('message--flash')
  requestAnimationFrame(() => {
    target.classList.add('message--flash')
  })
  target.addEventListener(
    'animationend',
    () => {
      target.classList.remove('message--flash')
    },
    { once: true },
  )
}

const createQuoteBlock = ({ quoteId, quoteMessage, messagesEl }) => {
  if (!quoteId) return null
  const quoteRole = normalizeRole(quoteMessage?.role)
  const label = quoteMessage ? formatRoleLabel(quoteMessage.role) : 'Quoted message'
  const preview = quoteMessage
    ? formatQuotePreview(quoteMessage.text) || 'Message'
    : 'Message unavailable'
  const quoteEl = document.createElement('button')
  quoteEl.type = 'button'
  quoteEl.className = 'message-quote'
  quoteEl.dataset.quoteRole = quoteRole
  quoteEl.dataset.quoteId = String(quoteId)
  if (quoteMessage && messagesEl) {
    quoteEl.addEventListener('click', () => {
      const targetId = quoteMessage.id
      if (!targetId) return
      const selectorId = escapeSelectorValue(String(targetId))
      const target = messagesEl.querySelector(
        `[data-message-id="${selectorId}"]`,
      )
      if (!target) return
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      flashMessage(target)
    })
  } else {
    quoteEl.disabled = true
  }
  const author = document.createElement('span')
  author.className = 'message-quote-author'
  author.textContent = label
  const text = document.createElement('span')
  text.className = 'message-quote-text'
  text.textContent = preview
  quoteEl.append(author, text)
  return quoteEl
}

const renderMessage = (params, msg) => {
  const {
    messagesEl,
    renderMarkdown,
    formatTime,
    formatUsage,
    formatElapsedLabel,
    enterMessageIds,
    onQuote,
    messageLookup,
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
    const quoteBlock = createQuoteBlock({
      quoteId: msg.quote,
      quoteMessage,
      messagesEl,
    })
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
  const elapsedText = isAgentMessage(msg)
    ? formatElapsedLabel(msg.elapsedMs)
    : ''
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
  if (msg?.role === 'user') {
    const delivery = document.createElement('span')
    delivery.className = 'delivery'
    delivery.textContent = '✓'
    delivery.title = 'Sent'
    delivery.setAttribute('aria-label', 'Sent')
    meta.appendChild(delivery)
  }
  meta.appendChild(time)
  article.appendChild(meta)

  item.appendChild(article)
  if (quoteBtn) item.appendChild(quoteBtn)
  messagesEl.appendChild(item)
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
  const renderParams = { ...params, messageLookup }
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
  article.textContent = `Error: ${message}`
  item.appendChild(article)
  messagesEl.appendChild(item)
  updateScrollButton()
}
