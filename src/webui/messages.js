import { formatTime } from './time.js'

export function createMessagesController({
  messagesEl,
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
  let showLoading = false

  function removeEmpty() {
    if (emptyRemoved) return
    const el = document.querySelector('[data-empty]')
    if (el) el.remove()
    emptyRemoved = true
  }

  function isAssistantMessage(msg) {
    return msg?.role === 'agent' || msg?.role === 'assistant'
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

    article.appendChild(content)
    item.appendChild(article)
    messagesEl.appendChild(item)
    loadingItem = item
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function removeLoadingPlaceholder() {
    if (loadingItem && loadingItem.isConnected) loadingItem.remove()
    loadingItem = null
  }

  function setLoading(active) {
    showLoading = active
    if (active) ensureLoadingPlaceholder()
    else removeLoadingPlaceholder()
  }

  function renderMessages(messages) {
    if (!messagesEl || !messages || messages.length === 0) return
    removeEmpty()
    const latestAssistant = findLatestAssistantMessage(messages)
    if (latestAssistant && latestAssistant.id !== lastAssistantMessageId) {
      lastAssistantMessageId = latestAssistant.id
      if (showLoading) setLoading(false)
    }
    loadingItem = null
    messagesEl.innerHTML = ''
    for (const msg of messages) {
      renderMessage(msg)
    }
    if (showLoading) ensureLoadingPlaceholder()
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  function renderMessage(msg) {
    if (!messagesEl) return
    const item = document.createElement('li')
    item.className = `message ${msg.role}`

    const article = document.createElement('article')

    const content = document.createElement('div')
    content.className = 'content'
    content.textContent = msg.text
    article.appendChild(content)

    const time = document.createElement('small')
    time.className = 'time'
    time.textContent = formatTime(msg.createdAt)
    article.appendChild(time)

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
