const $ = (sel) => document.querySelector(sel)

const statusDot = $('[data-status-dot]')
const statusText = $('[data-status-text]')
const messagesEl = $('[data-messages]')
const form = $('[data-form]')
const input = $('[data-input]')
const sendBtn = $('[data-send]')
const restartBtn = $('[data-restart]')

let pollTimer = null
let lastMessageCount = 0
let emptyRemoved = false

function removeEmpty() {
  if (emptyRemoved) return
  const el = $('[data-empty]')
  if (el) el.remove()
  emptyRemoved = true
}

// Render all messages from server data
function renderMessages(messages) {
  if (!messages || messages.length === 0) return
  removeEmpty()
  messagesEl.innerHTML = ''
  for (const msg of messages) {
    renderMessage(msg)
  }
  messagesEl.scrollTop = messagesEl.scrollHeight
}

// Render a single message
function renderMessage(msg) {
  const div = document.createElement('div')
  div.className = `message ${msg.role}`

  const content = document.createElement('div')
  content.className = 'content'
  content.textContent = msg.text
  div.appendChild(content)

  const time = document.createElement('div')
  time.className = 'time'
  time.textContent = formatTime(msg.createdAt)
  div.appendChild(time)

  messagesEl.appendChild(div)
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString()
  } catch {
    return ''
  }
}

// Poll status + messages
async function poll() {
  try {
    const [statusRes, msgRes] = await Promise.all([
      fetch('/api/status'),
      fetch('/api/messages?limit=50'),
    ])

    const status = await statusRes.json()
    const msgData = await msgRes.json()

    // Update status
    statusDot.dataset.state = status.agentStatus
    const parts = [status.agentStatus]
    if (status.activeTasks > 0) parts.push(`${status.activeTasks} tasks`)
    if (status.pendingInputs > 0) parts.push(`${status.pendingInputs} pending`)
    statusText.textContent = parts.join(' · ')

    // Update messages only when count changes
    const messages = msgData.messages || []
    if (messages.length !== lastMessageCount) {
      renderMessages(messages)
      lastMessageCount = messages.length
    }
  } catch {
    statusText.textContent = 'disconnected'
    statusDot.dataset.state = ''
  }

  pollTimer = setTimeout(poll, 2000)
}

// Send message
async function sendMessage(text) {
  sendBtn.disabled = true
  input.disabled = true

  try {
    const res = await fetch('/api/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to send')
    }

    input.value = ''

    // Immediately re-fetch to show the user message
    const msgRes = await fetch('/api/messages?limit=50')
    const msgData = await msgRes.json()
    const messages = msgData.messages || []
    renderMessages(messages)
    lastMessageCount = messages.length
  } catch (error) {
    removeEmpty()
    const div = document.createElement('div')
    div.className = 'message system'
    div.textContent = `Error: ${error.message}`
    messagesEl.appendChild(div)
  } finally {
    sendBtn.disabled = false
    input.disabled = false
    input.focus()
  }
}

// Form submit
form.addEventListener('submit', (e) => {
  e.preventDefault()
  const text = input.value.trim()
  if (text) sendMessage(text)
})

// Start
poll()
input.focus()

// Restart
restartBtn.addEventListener('click', async () => {
  if (!confirm('Restart server?')) return
  restartBtn.disabled = true
  statusText.textContent = 'restarting...'
  statusDot.dataset.state = ''
  try {
    await fetch('/api/restart', { method: 'POST' })
  } catch {
    // expected: connection drops
  }
  // Poll until server is back
  const waitForServer = () => {
    setTimeout(async () => {
      try {
        const res = await fetch('/api/status')
        if (res.ok) {
          restartBtn.disabled = false
          poll()
          return
        }
      } catch {
        // still down
      }
      waitForServer()
    }, 1000)
  }
  if (pollTimer) clearTimeout(pollTimer)
  waitForServer()
})
