const form = document.querySelector('[data-task-form]')
const submitButton = document.querySelector('[data-submit]')
const statusText = document.querySelector('[data-task-status]')
const statusDot = document.querySelector('[data-status-dot]')
const taskId = document.querySelector('[data-task-id]')
const runId = document.querySelector('[data-run-id]')
const sessionLabel = document.querySelector('[data-session]')
const result = document.querySelector('[data-task-result]')
const errorText = document.querySelector('[data-task-error]')

const fields = {
  sessionKey: document.querySelector('#sessionKey'),
  prompt: document.querySelector('#prompt'),
  resume: document.querySelector('#resume'),
  verifyCommand: document.querySelector('#verifyCommand'),
  maxIterations: document.querySelector('#maxIterations'),
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

const setTaskMeta = (task) => {
  taskId.textContent = task?.id || '--'
  runId.textContent = task?.runId || '--'
  sessionLabel.textContent = task?.sessionKey || '--'
}

const updateTask = (task) => {
  const status = task?.status || 'idle'
  setStatus(status, status === 'idle' ? 'Idle' : status)
  setTaskMeta(task)
  if (task?.result !== undefined) {
    setResult(task.result)
  } else if (status === 'queued' || status === 'running') {
    setResult('Waiting for worker output...')
  } else {
    setResult('')
  }
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
  const resume = fields.resume.value
  const verifyCommand = fields.verifyCommand.value.trim()
  const maxIterationsRaw = fields.maxIterations.value.trim()
  const payload = {
    sessionKey,
    prompt,
    resume,
  }
  if (verifyCommand) payload.verifyCommand = verifyCommand
  if (maxIterationsRaw) {
    const parsed = Number.parseInt(maxIterationsRaw, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      payload.maxIterations = parsed
    }
  }
  return payload
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
