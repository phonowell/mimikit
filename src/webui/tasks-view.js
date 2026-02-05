import { formatDateTime, formatElapsedLabel, formatUsage } from './messages/format.js'

const ELAPSED_TICK_MS = 1000


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


const formatElapsedText = (elapsedMs, hasUsage) => {
  const label = formatElapsedLabel(elapsedMs)
  if (!label) return ''
  return hasUsage ? `· ${label}` : label
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
    const hasUsage = item.dataset.hasUsage === 'true'
    item.textContent = formatElapsedText(elapsedMs, hasUsage)
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

export const renderTasks = (tasksList, data) => {
  if (!tasksList) return
  const previousScrollTop = tasksList.scrollTop
  const tasks = data?.tasks || []
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
    link.href = '#tasks-dialog'
    link.dataset.status = task.status || 'pending'

    const title = document.createElement('span')
    title.className = 'task-title'
    const titleText =
      typeof task.title === 'string' && task.title.trim() && task.title !== task.id
        ? task.title
        : 'Untitled task'
    title.textContent = titleText

    const meta = document.createElement('small')
    meta.className = 'task-meta'

    const status = document.createElement('span')
    status.className = 'task-status'
    const statusValue = task.status || 'pending'
    status.dataset.status = statusValue
    status.setAttribute('role', 'img')
    status.setAttribute('aria-label', statusValue)
    status.title = statusValue
    meta.appendChild(status)

    const elapsedEl = document.createElement('span')
    elapsedEl.className = 'task-elapsed'

    const createdAt = parseTimeMs(task.createdAt)
    const startedAt = parseTimeMs(task.startedAt)
    const completedAt = parseTimeMs(task.completedAt)
    const startMs = Number.isFinite(startedAt) ? startedAt : createdAt
    const durationMs =
      typeof task.durationMs === 'number' && Number.isFinite(task.durationMs)
        ? task.durationMs
        : resolveDurationMs(startMs, completedAt)

    const usageText = formatUsage(task.usage)
    const hasUsage = Boolean(usageText)

    if (usageText) {
      const tokensEl = document.createElement('span')
      tokensEl.className = 'task-tokens'
      tokensEl.textContent = usageText
      meta.appendChild(tokensEl)
    }

    if (task.status === 'running' && Number.isFinite(startMs)) {
      elapsedEl.dataset.startedAt = String(startMs)
      elapsedEl.dataset.elapsed = 'true'
      elapsedEl.dataset.hasUsage = hasUsage ? 'true' : 'false'
      elapsedEl.textContent = formatElapsedText(now - startMs, hasUsage)
      meta.appendChild(elapsedEl)
    } else if (durationMs !== null) {
      elapsedEl.textContent = formatElapsedText(durationMs, hasUsage)
      meta.appendChild(elapsedEl)
    }

    if (task.createdAt) {
      const timeEl = document.createElement('span')
      timeEl.className = 'task-time'
      timeEl.textContent = `created ${formatDateTime(task.createdAt)}`
      meta.appendChild(timeEl)
    }


    link.appendChild(title)
    link.appendChild(meta)
    item.appendChild(link)

    if (task.status === 'pending' || task.status === 'running') {
      const cancelBtn = document.createElement('button')
      cancelBtn.type = 'button'
      cancelBtn.className = 'btn btn--xs btn--danger task-cancel'
      cancelBtn.textContent = 'Cancel'
      cancelBtn.setAttribute('data-task-id', task.id)
      cancelBtn.setAttribute('aria-label', `Cancel task ${titleText}`)
      item.appendChild(cancelBtn)
    }

    tasksList.appendChild(item)
  }

  if (previousScrollTop > 0) {
    const maxTop = Math.max(0, tasksList.scrollHeight - tasksList.clientHeight)
    const nextTop = Math.min(maxTop, previousScrollTop)
    tasksList.scrollTop = nextTop
  }
}
