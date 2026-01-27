const form = document.querySelector('[data-task-form]')
const submitButton = document.querySelector('[data-submit]')
const statusText = document.querySelector('[data-task-status]')
const statusDot = document.querySelector('[data-status-dot]')
const result = document.querySelector('[data-task-result]')
const errorText = document.querySelector('[data-task-error]')
const sessionList = document.querySelector('[data-session-list]')
const sessionEmpty = document.querySelector('[data-session-empty]')
const refreshSessionsButton = document.querySelector('[data-refresh-sessions]')

const fields = {
  sessionKey: document.querySelector('#sessionKey'),
  prompt: document.querySelector('#prompt'),
}

let pollTimer = null
let pollToken = 0

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

const setResult = (message) => {
  result.textContent = message || ''
}

const updateTask = (task) => {
  const status = task?.status || 'idle'
  setStatus(status, status === 'idle' ? 'Idle' : status)
  if (task?.result !== undefined) {
    setResult(task.result)
  } else if (status === 'queued' || status === 'running') {
    setResult('Waiting for worker output...')
  } else {
    setResult('')
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
  const target = sessionKey?.trim() || ''
  const items = sessionList.querySelectorAll('[data-session-key]')
  items.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.sessionKey === target)
  })
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
  const current = fields.sessionKey.value.trim()
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
    avatar.textContent = session.sessionKey.slice(0, 2).toUpperCase()

    const body = document.createElement('div')
    body.className = 'session-body'

    const row = document.createElement('div')
    row.className = 'session-row'

    const name = document.createElement('span')
    name.className = 'session-name'
    name.textContent = session.sessionKey

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
      fields.sessionKey.value = session.sessionKey
      setActiveSession(session.sessionKey)
    })

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'session-delete'
    remove.textContent = 'Delete'
    remove.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      void deleteSession(session.sessionKey)
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

async function deleteSession(sessionKey) {
  const key = sessionKey.trim()
  if (!key) return
  if (!window.confirm(`Delete session "${key}"? This cannot be undone.`)) return
  setError('')
  try {
    await fetchJson(`/sessions/${encodeURIComponent(key)}`, { method: 'DELETE' })
    if (fields.sessionKey.value.trim() === key) {
      fields.sessionKey.value = 'default'
      setActiveSession(fields.sessionKey.value)
    }
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
    }
  } catch (error) {
    if (token !== pollToken) return
    setError(error instanceof Error ? error.message : String(error))
    setStatus('failed', 'failed')
  }
}

const buildPayload = () => {
  const sessionKey = fields.sessionKey.value.trim() || 'default'
  const prompt = fields.prompt.value.trim()
  return {
    sessionKey,
    prompt,
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  setError('')
  const payload = buildPayload()
  if (!payload.prompt) {
    setError('Prompt is required.')
    return
  }
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

fields.sessionKey.addEventListener('input', () => {
  setActiveSession(fields.sessionKey.value)
})

if (refreshSessionsButton) {
  refreshSessionsButton.addEventListener('click', () => {
    void loadSessions()
  })
}
