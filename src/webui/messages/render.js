export const isAgentMessage = (msg) => msg?.role === 'agent'

export const findLatestAgentMessage = (messages) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    if (isAgentMessage(msg)) return msg
  }
  return null
}

const renderMessage = (params, msg) => {
  const {
    messagesEl,
    renderMarkdown,
    formatTime,
    formatUsage,
    formatElapsedLabel,
  } = params
  if (!messagesEl) return
  const item = document.createElement('li')
  item.className = `message ${msg.role}`

  const article = document.createElement('article')

  const content = document.createElement('div')
  content.className = 'content'
  const text = msg?.text ?? ''
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
  const time = document.createElement('span')
  time.className = 'time'
  time.textContent = timeText
  meta.appendChild(time)
  article.appendChild(meta)

  item.appendChild(article)
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
  for (const msg of messages) {
    renderMessage(params, msg)
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
