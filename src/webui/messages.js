import { formatTime } from './time.js'
import { renderMarkdown } from './markdown.js'

export function createMessagesController({
  messagesEl,
  scrollBottomBtn,
  statusDot,
  statusText,
  input,
  sendBtn,
}) {
  let pollTimer = null
  let isPolling = false
  let lastMessageCount = 0
  let lastMessageId = null
  let emptyRemoved = false
  let lastStatus = null
  let lastAssistantMessageId = null
  let loadingItem = null
  let loadingTimeEl = null
  let loadingStartAt = null
  let loadingTimer = null
  let showLoading = false
  let scrollBound = false
  const scrollBottomMultiplier = 1.5
  const loadingTimeThreshold = 3000

  function removeEmpty() {
    if (emptyRemoved) return
    const el = document.querySelector('[data-empty]')
    if (el) el.remove()
    emptyRemoved = true
  }

  function isAssistantMessage(msg) {
    return msg?.role === 'agent' || msg?.role === 'assistant'
  }

  function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
  }

  function formatCount(value) {
    if (value === null) return ''
    const rounded = Math.round(value)
    if (Math.abs(rounded) < 1000)
      return new Intl.NumberFormat('en-US').format(rounded)
    const formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 1,
    }).format(rounded / 1000)
    return `${formatted}k`
  }

  function formatUsage(usage) {
    if (!usage) return ''
    const input = asNumber(usage.input)
    const output = asNumber(usage.output)
    const parts = []
    if (input !== null) parts.push(`↑ ${formatCount(input)}`)
    if (output !== null) parts.push(`↓ ${formatCount(output)}`)
    return parts.join(' · ')
  }

  function formatElapsedLabel(elapsedMs) {
    const ms = asNumber(elapsedMs)
    if (ms === null) return ''
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    if (totalSeconds < 60) return `${totalSeconds}s`
    const totalMinutes = Math.floor(totalSeconds / 60)
    const totalHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const seconds = totalSeconds % 60
    const parts = []
    if (totalHours > 0) {
      parts.push(`${totalHours}h`)
      parts.push(`${minutes}m`)
    } else {
      parts.push(`${totalMinutes}m`)
    }
    parts.push(`${seconds}s`)
    return parts.join(' ')
  }

  function getScrollState() {
    if (!messagesEl) return null
    const scrollHeight = messagesEl.scrollHeight
    const clientHeight = messagesEl.clientHeight
    const scrollTop = messagesEl.scrollTop
    const distance = scrollHeight - scrollTop - clientHeight
    return { scrollHeight, clientHeight, scrollTop, distance }
  }

  function getBottomThreshold(clientHeight) {
    return clientHeight * scrollBottomMultiplier
  }

  function isNearBottom() {
    const state = getScrollState()
    if (!state || state.clientHeight === 0) return true
    return state.distance <= getBottomThreshold(state.clientHeight)
  }

  function setScrollButtonVisible(visible) {
    if (!scrollBottomBtn) return
    if (!visible && document.activeElement === scrollBottomBtn) {
      scrollBottomBtn.blur()
    }
    scrollBottomBtn.classList.toggle('is-visible', visible)
    if (visible) {
      scrollBottomBtn.removeAttribute('aria-hidden')
      scrollBottomBtn.removeAttribute('inert')
    } else {
      scrollBottomBtn.setAttribute('aria-hidden', 'true')
      scrollBottomBtn.setAttribute('inert', '')
    }
    scrollBottomBtn.tabIndex = visible ? 0 : -1
  }

  function updateScrollButton() {
    if (!scrollBottomBtn || !messagesEl) return
    const state = getScrollState()
    if (!state || state.clientHeight === 0) {
      setScrollButtonVisible(false)
      return
    }
    const threshold = getBottomThreshold(state.clientHeight)
    setScrollButtonVisible(state.distance > threshold)
  }

  function scrollToBottom({ smooth = true } = {}) {
    if (!messagesEl) return
    const reduceMotion =
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior = smooth && !reduceMotion ? 'smooth' : 'auto'
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior })
  }

  function bindScrollControls() {
    if (!messagesEl || scrollBound) return
    scrollBound = true
    messagesEl.addEventListener(
      'scroll',
      () => {
        updateScrollButton()
      },
      { passive: true },
    )
    window.addEventListener('resize', updateScrollButton)
    if (scrollBottomBtn) {
      scrollBottomBtn.addEventListener('click', () => {
        scrollToBottom({ smooth: true })
        setScrollButtonVisible(false)
      })
    }
    updateScrollButton()
  }

  function findLatestAssistantMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (isAssistantMessage(msg)) return msg
    }
    return null
  }

  function ensureLoadingPlaceholder() {
    if (!messagesEl) return
    if (loadingItem && loadingItem.isConnected) return
    const shouldAutoScroll = isNearBottom()
    removeEmpty()
    const item = document.createElement('li')
    item.className = 'message assistant message-loading'

    const article = document.createElement('article')
    const content = document.createElement('div')
    content.className = 'content loading-dots'
    content.setAttribute('role', 'status')
    content.setAttribute('aria-label', 'Loading')

    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      content.appendChild(dot)
    }

    const time = document.createElement('span')
    time.className = 'loading-time'
    time.setAttribute('aria-live', 'polite')
    content.appendChild(time)

    article.appendChild(content)
    item.appendChild(article)
    messagesEl.appendChild(item)
    loadingItem = item
    loadingTimeEl = time
    updateLoadingElapsed()
    if (shouldAutoScroll) scrollToBottom({ smooth: false })
    updateScrollButton()
  }

  function removeLoadingPlaceholder() {
    if (loadingItem && loadingItem.isConnected) loadingItem.remove()
    loadingItem = null
    loadingTimeEl = null
    updateScrollButton()
  }

  function updateLoadingElapsed() {
    if (!loadingStartAt || !loadingTimeEl) return
    const elapsed = Date.now() - loadingStartAt
    if (elapsed < loadingTimeThreshold) {
      loadingTimeEl.textContent = ''
      loadingTimeEl.classList.remove('is-visible')
      return
    }
    const label = formatElapsedLabel(elapsed)
    loadingTimeEl.textContent = label ? `Waiting ${label}` : ''
    loadingTimeEl.classList.add('is-visible')
  }

  function startLoadingTimer() {
    if (loadingTimer) return
    loadingTimer = window.setInterval(updateLoadingElapsed, 500)
  }

  function stopLoadingTimer() {
    if (loadingTimer) clearInterval(loadingTimer)
    loadingTimer = null
    loadingStartAt = null
  }

  function setLoading(active) {
    const wasLoading = showLoading
    showLoading = active
    if (active) {
      if (!wasLoading) loadingStartAt = Date.now()
      ensureLoadingPlaceholder()
      startLoadingTimer()
    } else {
      stopLoadingTimer()
      removeLoadingPlaceholder()
    }
  }

  function renderMessages(messages) {
    if (!messagesEl || !messages || messages.length === 0) return
    removeEmpty()
    const latestAssistant = findLatestAssistantMessage(messages)
    if (latestAssistant && latestAssistant.id !== lastAssistantMessageId) {
      lastAssistantMessageId = latestAssistant.id
      if (showLoading) setLoading(false)
    }
    const wasNearBottom = isNearBottom()
    const previousScrollTop = messagesEl.scrollTop
    const previousScrollHeight = messagesEl.scrollHeight
    loadingItem = null
    loadingTimeEl = null
    messagesEl.innerHTML = ''
    for (const msg of messages) {
      renderMessage(msg)
    }
    if (showLoading) ensureLoadingPlaceholder()
    const newScrollHeight = messagesEl.scrollHeight
    if (wasNearBottom) {
      scrollToBottom({ smooth: false })
    } else {
      const delta = newScrollHeight - previousScrollHeight
      const nextTop = previousScrollTop + delta
      messagesEl.scrollTop = nextTop < 0 ? 0 : nextTop
    }
    updateScrollButton()
  }

  function renderMessage(msg) {
    if (!messagesEl) return
    const item = document.createElement('li')
    item.className = `message ${msg.role}`

    const article = document.createElement('article')

    const content = document.createElement('div')
    content.className = 'content'
    const text = msg?.text ?? ''
    if (isAssistantMessage(msg)) {
      content.classList.add('markdown')
      content.appendChild(renderMarkdown(text))
    } else {
      content.textContent = text
    }
    article.appendChild(content)

    const usageText = isAssistantMessage(msg) ? formatUsage(msg.usage) : ''
    const elapsedText = isAssistantMessage(msg)
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

  function renderError(error) {
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

  function updateStatus(status) {
    const wasRunning = lastStatus?.agentStatus === 'running'
    lastStatus = status
    if (!wasRunning && status.agentStatus === 'running') setLoading(true)
    if (!statusText || !statusDot) return
    statusDot.dataset.state = status.agentStatus
    const parts = [status.agentStatus]
    if (status.activeTasks > 0) parts.push(`${status.activeTasks} tasks`)
    if (status.pendingTasks > 0) parts.push(`${status.pendingTasks} pending`)
    statusText.textContent = parts.join(' · ')
  }

  function setDisconnected() {
    if (statusText) statusText.textContent = 'disconnected'
    if (statusDot) statusDot.dataset.state = ''
    lastStatus = null
    setLoading(false)
  }

  async function poll() {
    if (!isPolling) return
    try {
      const [statusRes, msgRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/messages?limit=50'),
      ])

      const status = await statusRes.json()
      const msgData = await msgRes.json()
      updateStatus(status)

      const messages = msgData.messages || []
      const newestMessageId =
        messages.length > 0 ? messages[messages.length - 1].id : null
      if (
        messages.length !== lastMessageCount ||
        newestMessageId !== lastMessageId
      ) {
        if (messages.length > 0) renderMessages(messages)
        lastMessageCount = messages.length
        lastMessageId = newestMessageId
      }
    } catch {
      setDisconnected()
    }

    if (!isPolling) return
    pollTimer = window.setTimeout(poll, 2000)
  }

  async function sendMessage(text) {
    if (!text) return
    if (sendBtn) sendBtn.disabled = true
    if (input) input.disabled = true

    try {
      const res = await fetch('/api/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) {
        let data = null
        try {
          data = await res.json()
        } catch {
          data = null
        }
        throw new Error(data?.error || 'Failed to send')
      }

      if (input) input.value = ''

      const msgRes = await fetch('/api/messages?limit=50')
      const msgData = await msgRes.json()
      const messages = msgData.messages || []
      const newestMessageId =
        messages.length > 0 ? messages[messages.length - 1].id : null
      renderMessages(messages)
      lastMessageCount = messages.length
      lastMessageId = newestMessageId
    } catch (error) {
      renderError(error)
    } finally {
      if (sendBtn) sendBtn.disabled = false
      if (input) {
        input.disabled = false
        input.focus()
      }
    }
  }

  function start() {
    if (isPolling) return
    bindScrollControls()
    isPolling = true
    poll()
  }

  function stop() {
    isPolling = false
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = null
  }

  function isFullyIdle() {
    if (!lastStatus) return false
    return (
      lastStatus.agentStatus === 'idle' &&
      (lastStatus.activeTasks ?? 0) === 0 &&
      (lastStatus.pendingTasks ?? 0) === 0
    )
  }

  return { start, stop, sendMessage, isFullyIdle }
}

export function bindComposer({ form, input, messages }) {
  if (!form || !input || !messages) return

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (text) messages.sendMessage(text)
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
}
