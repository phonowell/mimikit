import {
  formatDateTime,
  formatElapsedLabel,
  formatTime,
  formatUsage,
} from './messages/format.js'
import { UI_TEXT, resolveTaskStatusLabel } from './system-text.js'

const ELAPSED_TICK_MS = 1000
const ISO_SCHEDULE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/
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

const resolveProfileText = (task) => {
  if (task?.profile === 'manager') return 'manager'
  if (task?.profile === 'specialist') return 'specialist'
  return 'standard'
}

const parseIsoScheduleDate = (value) => {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  if (!ISO_SCHEDULE_PATTERN.test(text)) return null
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed)
}

const isSameLocalDay = (left, right) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const formatScheduleText = (value, nowDate) => {
  const scheduleDate = parseIsoScheduleDate(value)
  if (!scheduleDate) return ''
  const baseDate = new Date(nowDate)
  baseDate.setHours(0, 0, 0, 0)
  const timeText = scheduleDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (isSameLocalDay(scheduleDate, baseDate)) return `today ${timeText}`
  const tomorrow = new Date(baseDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (isSameLocalDay(scheduleDate, tomorrow)) return `tomorrow ${timeText}`
  const yesterday = new Date(baseDate)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameLocalDay(scheduleDate, yesterday)) return `yesterday ${timeText}`
  const dateText = scheduleDate.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })
  return `${dateText} ${timeText}`
}

const resolveCronBadge = (value, nowDate) => {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const scheduleText = formatScheduleText(raw, nowDate)
  if (!scheduleText) return { text: raw, title: `cron: ${raw}` }
  const scheduleTitle = formatDateTime(raw) || raw
  return { text: scheduleText, title: `scheduled: ${scheduleTitle}` }
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
    article.textContent = UI_TEXT.noTasks
    empty.appendChild(article)
    tasksList.appendChild(empty)
    return
  }

  const now = Date.now()
  const nowDate = new Date(now)

  for (const task of tasks) {
    const item = document.createElement('li')
    item.className = 'task-item'
    const statusValue = task.status || 'pending'
    const profileValue = resolveProfileText(task)
    item.dataset.status = statusValue
    item.dataset.profile = profileValue

    const isCancelable = statusValue === 'pending' || statusValue === 'running'
    const hasArchivePath =
      typeof task.archivePath === 'string' && task.archivePath.trim().length > 0
    const canOpenArchive = hasArchivePath && !isCancelable

    const link = document.createElement(canOpenArchive ? 'a' : 'div')
    link.className = 'task-link'
    link.dataset.status = statusValue
    if (canOpenArchive) {
      link.href = '#'
      link.setAttribute('data-task-id', task.id)
      link.setAttribute('data-archive-openable', 'true')
    }

    const titleRow = document.createElement('div')
    titleRow.className = 'task-title-row'

    const title = document.createElement('span')
    title.className = 'task-title'
    const titleText =
      typeof task.title === 'string' && task.title.trim() && task.title !== task.id
        ? task.title
        : UI_TEXT.untitledTask
    title.textContent = titleText

    const meta = document.createElement('small')
    meta.className = 'task-meta'

    const status = document.createElement('span')
    status.className = 'task-status'
    status.dataset.status = statusValue
    const statusLabel = resolveTaskStatusLabel(statusValue)
    const dotTitle = `${statusValue}/${profileValue}`
    status.setAttribute('role', 'img')
    status.setAttribute('aria-label', `${statusLabel} · profile ${profileValue}`)
    status.title = dotTitle

    if (task.cron) {
      const cronBadge = resolveCronBadge(task.cron, nowDate)
      if (cronBadge) {
        const cronEl = document.createElement('span')
        cronEl.className = 'task-cron'
        cronEl.textContent = cronBadge.text
        cronEl.title = cronBadge.title
        meta.appendChild(cronEl)
      }
    }

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

    const changeAt =
      typeof task.changeAt === 'string' && task.changeAt.trim()
        ? task.changeAt
        : typeof task.change_at === 'string' && task.change_at.trim()
          ? task.change_at
          : ''

    if (changeAt) {
      const timeEl = document.createElement('span')
      timeEl.className = 'task-time'
      timeEl.textContent = formatTime(changeAt)
      meta.appendChild(timeEl)
    }

    titleRow.appendChild(status)
    titleRow.appendChild(title)

    if (isCancelable) {
      const cancelBtn = document.createElement('button')
      cancelBtn.type = 'button'
      cancelBtn.className = 'btn btn--icon btn--icon-muted task-cancel'
      cancelBtn.textContent = '✕'
      cancelBtn.setAttribute('data-task-id', task.id)
      cancelBtn.setAttribute('title', `Cancel ${titleText}`)
      cancelBtn.setAttribute('aria-label', `Cancel ${titleText}`)
      titleRow.appendChild(cancelBtn)
    }

    link.appendChild(titleRow)
    link.appendChild(meta)
    item.appendChild(link)

    tasksList.appendChild(item)
  }

  if (previousScrollTop > 0) {
    const maxTop = Math.max(0, tasksList.scrollHeight - tasksList.clientHeight)
    const nextTop = Math.min(maxTop, previousScrollTop)
    tasksList.scrollTop = nextTop
  }
}
