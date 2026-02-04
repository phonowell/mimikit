import { formatDateTime } from './time.js'

const ELAPSED_TICK_MS = 1000

const pad2 = (value) => String(value).padStart(2, '0')

export const formatElapsedMs = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(seconds)}`
  return `${minutes}:${pad2(seconds)}`
}

const parseTimeMs = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Date.parse(trimmed)
  if (Number.isFinite(parsed)) return parsed
  const asNumber = Number(trimmed)
  return Number.isFinite(asNumber) ? asNumber : null
}

const resolveDurationMs = (startMs, endMs) => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return Math.max(0, endMs - startMs)
}

const formatTokenCount = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('en-US').format(Math.round(value))
    : '--'

const formatTokensLabel = (usage) => {
  const input = formatTokenCount(usage?.input)
  const output = formatTokenCount(usage?.output)
  return `tokens ${input}/${output}`
}

const formatStatusCounts = (counts) => {
  const parts = []
  if (!counts) return parts
  if (counts.pending) parts.push(`${counts.pending} pending`)
  if (counts.running) parts.push(`${counts.running} running`)
  if (counts.succeeded) parts.push(`${counts.succeeded} succeeded`)
  if (counts.failed) parts.push(`${counts.failed} failed`)
  if (counts.canceled) parts.push(`${counts.canceled} canceled`)
  return parts
}

const updateElapsedTimes = (tasksList) => {
  if (!tasksList) return
  const now = Date.now()
  const items = tasksList.querySelectorAll('[data-elapsed][data-started-at]')
  for (const item of items) {
    if (!(item instanceof HTMLElement)) continue
    const startedAt = Number(item.dataset.startedAt)
    if (!Number.isFinite(startedAt)) continue
    const elapsedMs = Math.max(0, now - startedAt)
    item.textContent = `elapsed ${formatElapsedMs(elapsedMs)}`
  }
}

export const createElapsedTicker = (tasksList) => {
  let timer = null
  const start = () => {
    if (timer) return
    updateElapsedTimes(tasksList)
    timer = window.setInterval(() => updateElapsedTimes(tasksList), ELAPSED_TICK_MS)
  }
  const stop = () => {
    if (!timer) return
    window.clearInterval(timer)
    timer = null
  }
  const update = () => updateElapsedTimes(tasksList)
  return { start, stop, update }
}

export const renderTasks = (tasksList, tasksMeta, data) => {
  if (!tasksList || !tasksMeta) return
  const tasks = data?.tasks || []
  const counts = data?.counts || {}
  const parts = [`${tasks.length} tasks`, ...formatStatusCounts(counts)]
  tasksMeta.textContent = parts.join(' · ')
  tasksList.innerHTML = ''

  if (tasks.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'tasks-empty'
    const article = document.createElement('article')
    article.textContent = 'No tasks'
    empty.appendChild(article)
    tasksList.appendChild(empty)
    return
  }

  const now = Date.now()

  for (const task of tasks) {
    const item = document.createElement('li')
    item.className = 'task-item'
    item.dataset.status = task.status || 'pending'

    const link = document.createElement('a')
    link.className = 'task-link'
    link.href = `#task-${task.id}`
    link.dataset.status = task.status || 'pending'

    const title = document.createElement('span')
    title.className = 'task-title'
    title.textContent = task.title || task.id

    const meta = document.createElement('small')
    meta.className = 'task-meta'

    const status = document.createElement('span')
    status.className = 'task-status'
    status.textContent = task.status || 'pending'
    meta.appendChild(status)

    const elapsedEl = document.createElement('span')
    elapsedEl.className = 'task-elapsed'
    elapsedEl.dataset.elapsed = 'true'

    const createdAt = parseTimeMs(task.createdAt)
    const startedAt = parseTimeMs(task.startedAt)
    const completedAt = parseTimeMs(task.completedAt)
    const startMs = Number.isFinite(startedAt) ? startedAt : createdAt
    const durationMs =
      typeof task.durationMs === 'number' && Number.isFinite(task.durationMs)
        ? task.durationMs
        : resolveDurationMs(startMs, completedAt)

    if (task.status === 'running' && Number.isFinite(startMs)) {
      elapsedEl.dataset.startedAt = String(startMs)
      elapsedEl.textContent = `elapsed ${formatElapsedMs(now - startMs)}`
    } else if (durationMs !== null) {
      elapsedEl.textContent = `elapsed ${formatElapsedMs(durationMs)}`
    } else {
      elapsedEl.textContent = 'elapsed --:--'
    }
    meta.appendChild(elapsedEl)

    const tokensEl = document.createElement('span')
    tokensEl.className = 'task-tokens'
    tokensEl.textContent = formatTokensLabel(task.usage)
    meta.appendChild(tokensEl)

    if (task.createdAt) {
      const timeEl = document.createElement('span')
      timeEl.className = 'task-time'
      timeEl.textContent = `created ${formatDateTime(task.createdAt)}`
      meta.appendChild(timeEl)
    }

    const id = document.createElement('span')
    id.className = 'task-id'
    id.textContent = `id:${task.id}`
    meta.appendChild(id)

    link.appendChild(title)
    link.appendChild(meta)
    item.appendChild(link)

    if (task.status === 'pending' || task.status === 'running') {
      const cancelBtn = document.createElement('button')
      cancelBtn.type = 'button'
      cancelBtn.className = 'btn btn--xs btn--danger task-cancel'
      cancelBtn.textContent = 'Cancel'
      cancelBtn.setAttribute('data-task-id', task.id)
      cancelBtn.setAttribute('aria-label', `Cancel task ${task.id}`)
      item.appendChild(cancelBtn)
    }

    tasksList.appendChild(item)
  }
}
