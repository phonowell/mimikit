const form = document.querySelector('[data-task-form]')
const submitButton = document.querySelector('[data-submit]')
const statusText = document.querySelector('[data-task-status]')
const statusDot = document.querySelector('[data-status-dot]')
const errorText = document.querySelector('[data-task-error]')
const sessionList = document.querySelector('[data-session-list]')
const sessionEmpty = document.querySelector('[data-session-empty]')
const thread = document.querySelector('[data-thread]')
const threadEmpty = document.querySelector('[data-thread-empty]')
const newThreadButton = document.querySelector('[data-new-thread]')
const refreshSessionsButton = document.querySelector('[data-refresh-sessions]')
const restartButton = document.querySelector('[data-restart]')

const fields = {
  prompt: document.querySelector('#prompt'),
}

let activeSessionKey = null
let pollTimer = null
let pollToken = 0
const defaultThreadEmptyText = threadEmpty?.textContent ?? 'No messages yet.'

const createSessionKey = () => {
  if (window.crypto?.randomUUID) return `thread-${window.crypto.randomUUID()}`
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12)
    window.crypto.getRandomValues(bytes)
    return `thread-${Array.from(bytes, (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('')}`
  }
  return `thread-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
}

const stopPolling = () => {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  pollToken += 1
}

const setStatus = (state, label) => {
  statusText.textContent = label
  statusDot.dataset.state = state
}

const setError = (message) => {
  if (!message) {
    errorText.textContent = ''
    errorText.hidden = true
    return
  }
  errorText.textContent = message
  errorText.hidden = false
}

const setThreadEmptyText = (message) => {
  if (!threadEmpty) return
  threadEmpty.textContent = message
}

const buildMessageElement = (entry) => {
  const role = entry?.role === 'user' ? 'user' : 'assistant'
  const item = document.createElement('div')
  item.className = `message ${role === 'user' ? 'outgoing' : 'incoming'}`
  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  if (entry?.error) bubble.classList.add('bubble-error')
  const title = document.createElement('span')
  title.className = 'bubble-title'
  title.textContent = role === 'user' ? 'You' : 'Worker'
  const body = document.createElement('pre')
  body.textContent = typeof entry?.text === 'string' ? entry.text : ''
  bubble.append(title, body)
  item.append(bubble)
  return item
}

const renderThread = (entries) => {
  if (!thread) return
  thread.textContent = ''
  if (threadEmpty) thread.append(threadEmpty)
  if (!entries.length) {
    if (threadEmpty) threadEmpty.hidden = false
    return
  }
  if (threadEmpty) threadEmpty.hidden = true
  entries.forEach((entry) => {
    thread.append(buildMessageElement(entry))
  })
  thread.scrollTop = thread.scrollHeight
}

const appendMessage = (entry) => {
  if (!thread) return
  if (threadEmpty) threadEmpty.hidden = true
  thread.append(buildMessageElement(entry))
  thread.scrollTop = thread.scrollHeight
}

const updateTask = (task) => {
  const status = task?.status || 'idle'
  setStatus(status, status === 'idle' ? 'Idle' : status)
  if (status === 'queued' || status === 'running') {
    setThreadEmptyText('Waiting for worker output...')
  } else {
    setThreadEmptyText(defaultThreadEmptyText)
  }
}

const formatSessionTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const formatter = new Intl.DateTimeFormat(undefined, isToday
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric' })
  return formatter.format(date)
}

const formatSessionPreview = (value) => {
  if (!value) return 'No activity yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity yet'
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return `Updated ${formatter.format(date)}`
}

const setActiveSession = (sessionKey) => {
  if (!sessionList) return
  const target = (sessionKey ?? activeSessionKey ?? '').trim()
  const items = sessionList.querySelectorAll('[data-session-key]')
  items.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.sessionKey === target)
  })
}

const clearActiveSession = () => {
  activeSessionKey = null
  setActiveSession('')
  renderThread([])
}

const renderSessions = (sessions) => {
  if (!sessionList) return
  sessionList.textContent = ''
  if (sessionEmpty) sessionList.append(sessionEmpty)
  if (!sessions.length) {
    if (sessionEmpty) sessionEmpty.hidden = false
    return
  }
  if (sessionEmpty) sessionEmpty.hidden = true
  const current = (activeSessionKey ?? '').trim()
  sessions.forEach((session) => {
    const item = document.createElement('div')
    item.className = 'session-item'
    item.dataset.sessionKey = session.sessionKey
    if (session.sessionKey === current) item.classList.add('is-active')

    const select = document.createElement('button')
    select.type = 'button'
    select.className = 'session-select'

    const avatar = document.createElement('div')
    avatar.className = 'session-avatar'
    const summary =
      typeof session.summary === 'string' ? session.summary.trim() : ''
    const label = summary || 'Untitled task'
    const avatarText = label.slice(0, 1).toUpperCase() || '?'
    avatar.textContent = avatarText

    const body = document.createElement('div')
    body.className = 'session-body'

    const row = document.createElement('div')
    row.className = 'session-row'

    const name = document.createElement('span')
    name.className = 'session-name'
    name.textContent = label

    const time = document.createElement('span')
    time.className = 'session-time'
    time.textContent = formatSessionTime(session.updatedAt)

    const preview = document.createElement('span')
    preview.className = 'session-preview'
    preview.textContent = formatSessionPreview(session.updatedAt)

    row.append(name, time)
    body.append(row, preview)
    select.append(avatar, body)

    select.addEventListener('click', () => {
      activeSessionKey = session.sessionKey
      setActiveSession(session.sessionKey)
      void loadTranscript(session.sessionKey)
    })

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'session-delete'
    remove.textContent = 'Delete'
    remove.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void deleteSession(session.sessionKey, label)
    })

    item.append(select, remove)
    sessionList.append(item)
  })
}

const fetchJson = async (url, options) => {
  const response = await fetch(url, options)
  let payload = null
  try {
    payload = await response.json()
  } catch (error) {
    payload = null
  }
  if (!response.ok) {
    const message = payload?.error || response.statusText
    throw new Error(message)
  }
  return payload
}

async function deleteSession(sessionKey, label) {
  const key = sessionKey.trim()
  if (!key) return
  const safeLabel = typeof label === 'string' && label.trim()
    ? label.trim()
    : 'this thread'
  if (!window.confirm(`Delete "${safeLabel}"? This cannot be undone.`)) return
  setError('')
  try {
    await fetchJson(`/sessions/${encodeURIComponent(key)}`, { method: 'DELETE' })
    if (activeSessionKey?.trim() === key) clearActiveSession()
    await loadSessions()
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error))
  }
}

const loadSessions = async () => {
  if (!sessionList) return
  try {
    const payload = await fetchJson('/sessions')
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : []
    renderSessions(sessions)
  } catch {
    if (sessionEmpty) sessionEmpty.hidden = false
  }
}

const loadTranscript = async (sessionKey) => {
  if (!thread) return
  const key = typeof sessionKey === 'string' ? sessionKey.trim() : ''
  if (!key) {
    renderThread([])
    return
  }
  try {
    const payload = await fetchJson(
      `/sessions/${encodeURIComponent(key)}/messages`,
    )
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    renderThread(messages)
  } catch (error) {
    setError(error instanceof Error ? error.message : String(error))
  }
}

const pollTask = async (id, token) => {
  if (token !== pollToken) return
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  try {
    const task = await fetchJson(`/tasks/${encodeURIComponent(id)}`)
    if (token !== pollToken) return
    updateTask(task)
    if (task.status === 'queued' || task.status === 'running') {
      pollTimer = setTimeout(() => pollTask(id, token), 1200)
    } else if (task?.sessionKey) {
      void loadTranscript(task.sessionKey)
    }
  } catch (error) {
    if (token !== pollToken) return
    setError(error instanceof Error ? error.message : String(error))
    setStatus('failed', 'failed')
  }
}

const buildPayload = () => {
  let sessionKey = activeSessionKey?.trim()
  if (!sessionKey) {
    sessionKey = createSessionKey()
    activeSessionKey = sessionKey
  }
  const prompt = fields.prompt.value.trim()
  return {
    sessionKey,
    prompt,
  }
}

const submitForm = () => {
  if (typeof form?.requestSubmit === 'function') {
    form.requestSubmit()
    return
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

if (fields.prompt) {
  fields.prompt.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    if (submitButton.disabled) return
    event.preventDefault()
    submitForm()
  })
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  setError('')
  const payload = buildPayload()
  if (!payload.prompt) {
    setError('Prompt is required.')
    return
  }
  fields.prompt.value = ''
  appendMessage({ role: 'user', text: payload.prompt })
  stopPolling()
  const token = pollToken
  submitButton.disabled = true
  submitButton.textContent = 'Submitting...'
  try {
    const task = await fetchJson('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (token !== pollToken) return
    if (task?.sessionKey) {
      activeSessionKey = task.sessionKey
      setActiveSession(task.sessionKey)
    }
    updateTask(task)
    void loadSessions()
    await pollTask(task.id, token)
  } catch (error) {
    if (token !== pollToken) return
    setError(error instanceof Error ? error.message : String(error))
    setStatus('failed', 'failed')
  } finally {
    submitButton.disabled = false
    submitButton.textContent = 'Send task'
  }
})

updateTask(null)
void loadSessions()

if (newThreadButton) {
  newThreadButton.addEventListener('click', () => {
    clearActiveSession()
  })
}

if (refreshSessionsButton) {
  refreshSessionsButton.addEventListener('click', () => {
    void loadSessions()
  })
}

if (restartButton) {
  restartButton.addEventListener('click', async () => {
    if (!window.confirm('Restart the server? Active tasks may be interrupted.')) return
    setError('')
    restartButton.disabled = true
    restartButton.textContent = 'Restarting...'
    try {
      await fetchJson('/control/restart?force=true', { method: 'POST' })
      setError('Server is restarting. Please refresh the page.')
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      restartButton.disabled = false
      restartButton.textContent = 'Restart Server'
    }
  })
}
