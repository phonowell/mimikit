const $ = (sel) => document.querySelector(sel)

const statusDot = $('[data-status-dot]')
const statusText = $('[data-status-text]')
const messagesEl = $('[data-messages]')
const form = $('[data-form]')
const input = $('[data-input]')
const sendBtn = $('[data-send]')
const restartBtn = $('[data-restart]')
const tasksBtn = $('[data-tasks-btn]')
const tasksModal = $('[data-tasks-modal]')
const tasksList = $('[data-tasks-list]')
const tasksMeta = $('[data-tasks-meta]')
const tasksCloseEls = document.querySelectorAll('[data-tasks-close]')

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

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString()
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
    if (status.pendingTasks > 0) parts.push(`${status.pendingTasks} pending`)
    if (status.pendingInputs > 0) parts.push(`${status.pendingInputs} inputs`)
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

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    form.requestSubmit()
  }
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

async function loadTasks() {
  if (!tasksList || !tasksMeta) return
  tasksMeta.textContent = 'Loading...'
  tasksList.innerHTML = ''
  try {
    const res = await fetch('/api/tasks?limit=200')
    if (!res.ok) throw new Error('Failed to load tasks')
    const data = await res.json()
    renderTasks(data)
  } catch (error) {
    tasksMeta.textContent = 'Failed to load tasks'
    const empty = document.createElement('div')
    empty.className = 'tasks-empty'
    const message = error instanceof Error ? error.message : String(error)
    empty.textContent = message
    tasksList.appendChild(empty)
  }
}

function renderTasks(data) {
  if (!tasksList || !tasksMeta) return
  const tasks = data?.tasks || []
  const counts = data?.counts || {}
  const parts = [`${tasks.length} tasks`]
  if (counts.pending) parts.push(`${counts.pending} pending`)
  if (counts.running) parts.push(`${counts.running} running`)
  if (counts.done) parts.push(`${counts.done} done`)
  if (counts.failed) parts.push(`${counts.failed} failed`)
  tasksMeta.textContent = parts.join(' · ')
  tasksList.innerHTML = ''

  if (tasks.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'tasks-empty'
    empty.textContent = 'No tasks'
    tasksList.appendChild(empty)
    return
  }

  for (const task of tasks) {
    const item = document.createElement('div')
    item.className = 'task-item'
    item.dataset.status = task.status || 'pending'

    const title = document.createElement('div')
    title.className = 'task-title'
    title.textContent = task.title || task.id

    const meta = document.createElement('div')
    meta.className = 'task-meta'

    const status = document.createElement('span')
    status.className = 'task-status'
    status.textContent = task.status || 'pending'
    meta.appendChild(status)

    const time = task.completedAt || task.createdAt
    if (time) {
      const timeEl = document.createElement('span')
      timeEl.textContent = formatDateTime(time)
      meta.appendChild(timeEl)
    }

    const id = document.createElement('span')
    id.textContent = `id:${task.id}`
    meta.appendChild(id)

    item.appendChild(title)
    item.appendChild(meta)
    tasksList.appendChild(item)
  }
}

function openTasksModal() {
  if (!tasksModal) return
  tasksModal.hidden = false
  document.body.classList.add('modal-open')
  loadTasks()
}

function closeTasksModal() {
  if (!tasksModal) return
  tasksModal.hidden = true
  document.body.classList.remove('modal-open')
}

if (tasksBtn) {
  tasksBtn.addEventListener('click', () => {
    openTasksModal()
  })
}

for (const el of tasksCloseEls) {
  el.addEventListener('click', () => {
    closeTasksModal()
  })
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (!tasksModal || tasksModal.hidden) return
  closeTasksModal()
})
