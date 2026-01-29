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
  let emptyRemoved = false

  function removeEmpty() {
    if (emptyRemoved) return
    const el = document.querySelector('[data-empty]')
    if (el) el.remove()
    emptyRemoved = true
  }

  function renderMessages(messages) {
    if (!messagesEl || !messages || messages.length === 0) return
    removeEmpty()
    messagesEl.innerHTML = ''
    for (const msg of messages) {
      renderMessage(msg)
    }
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
    if (!statusText || !statusDot) return
    statusDot.dataset.state = status.agentStatus
    const parts = [status.agentStatus]
    if (status.activeTasks > 0) parts.push(`${status.activeTasks} tasks`)
    if (status.pendingTasks > 0) parts.push(`${status.pendingTasks} pending`)
    if (status.pendingInputs > 0) parts.push(`${status.pendingInputs} inputs`)
    statusText.textContent = parts.join(' · ')
  }

  function setDisconnected() {
    if (statusText) statusText.textContent = 'disconnected'
    if (statusDot) statusDot.dataset.state = ''
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
      if (messages.length !== lastMessageCount) {
        renderMessages(messages)
        lastMessageCount = messages.length
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
      renderMessages(messages)
      lastMessageCount = messages.length
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

  return { start, stop, sendMessage }
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
