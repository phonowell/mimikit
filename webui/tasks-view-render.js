import {
  formatDateTimeFull,
  formatDisplayTimeWithFull,
  parseTimeInput,
} from './messages/format-time.js'
import { formatUsage } from './messages/format-usage.js'
import { renderEmptyListState } from './list-empty.js'
import { appendMetaTime } from './meta-time.js'
import { captureListScrollState, restoreListScrollState } from './list-scroll-sync.js'
import {
  UI_TEXT,
  resolveTaskPendingReasonLabel,
  resolveTaskStatusLabel,
} from './system-text.js'
import { createTaskActions } from './tasks-view-actions.js'
import { formatElapsedText } from './tasks-view-time.js'

const toTimeMs = (value) => {
  const parsed = parseTimeInput(value)
  return parsed ? parsed.getTime() : null
}

const resolveDurationMs = (startMs, endMs) => {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return Math.max(0, endMs - startMs)
}

const resolveCronBadge = (value) => {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  return { text: raw, title: `cron: ${raw}` }
}

const resolveScheduledBadge = (value, nowDate) => {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  const schedulePair = formatDisplayTimeWithFull(raw, {
    now: nowDate,
    relative: false,
    calendarWords: true,
  })
  const scheduleTitle = formatDateTimeFull(raw) || raw
  return {
    text: schedulePair.displayText || (schedulePair.fullText ? '' : raw),
    title: `scheduled: ${scheduleTitle}`,
  }
}

const BOTTOM_SCROLL_THRESHOLD_MULTIPLIER = 0.1

export const resolveTaskUsageDisplay = (usage) => {
  const usageDisplay = formatUsage(usage)
  const formatted = usageDisplay?.text ?? ''
  const text = formatted.trim()
  if (text) {
    return {
      text,
      title: usageDisplay?.title ?? '',
      hasUsage: true,
    }
  }
  return {
    text: '-',
    title: '',
    hasUsage: false,
  }
}

export const renderTasks = (tasksList, data) => {
  if (!tasksList) return
  const previousScrollState = captureListScrollState(tasksList, {
    bottomThresholdMultiplier: BOTTOM_SCROLL_THRESHOLD_MULTIPLIER,
  })
  const tasks = data?.tasks || []

  if (tasks.length === 0) {
    renderEmptyListState(tasksList, 'tasks-empty', UI_TEXT.noTasks)
    restoreListScrollState(tasksList, previousScrollState)
    return
  }
  tasksList.innerHTML = ''

  const now = Date.now()
  const nowDate = new Date(now)

  for (const task of tasks) {
    const item = document.createElement('li')
    item.className = 'task-item'
    const statusValue = task.status || 'pending'
    const taskId = typeof task.id === 'string' ? task.id.trim() : ''
    item.dataset.status = statusValue

    const isCancelable = statusValue === 'pending' || statusValue === 'running'
    const canOpenArchive = taskId.length > 0

    const link = document.createElement(canOpenArchive ? 'a' : 'div')
    link.className = 'task-link'
    link.dataset.status = statusValue
    if (canOpenArchive) {
      link.href = '#'
      link.setAttribute('data-task-id', taskId)
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
    status.setAttribute('role', 'img')
    status.setAttribute('aria-label', statusLabel)
    status.title = statusValue

    if (task.scheduledAt) {
      const scheduledBadge = resolveScheduledBadge(task.scheduledAt, nowDate)
      if (scheduledBadge) {
        const cronEl = document.createElement('span')
        cronEl.className = 'task-cron'
        cronEl.textContent = scheduledBadge.text
        cronEl.title = scheduledBadge.title
        meta.appendChild(cronEl)
      }
    } else if (task.cron) {
      const cronBadge = resolveCronBadge(task.cron)
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

    const createdAt = toTimeMs(task.createdAt)
    const startedAt = toTimeMs(task.startedAt)
    const completedAt = toTimeMs(task.completedAt)
    const startMs = Number.isFinite(startedAt) ? startedAt : createdAt
    const durationMs =
      typeof task.durationMs === 'number' && Number.isFinite(task.durationMs)
        ? task.durationMs
        : resolveDurationMs(startMs, completedAt)

    const usageDisplay = resolveTaskUsageDisplay(task.usage)
    const hasUsage = usageDisplay.hasUsage
    const tokensEl = document.createElement('span')
    tokensEl.className = 'task-tokens'
    tokensEl.textContent = usageDisplay.text
    if (usageDisplay.title) tokensEl.title = usageDisplay.title
    meta.appendChild(tokensEl)

    const pendingReasonRaw =
      typeof task.pending_reason === 'string' ? task.pending_reason : ''
    const pendingReasonLabel =
      statusValue === 'pending'
        ? resolveTaskPendingReasonLabel(pendingReasonRaw)
        : ''
    if (pendingReasonLabel) {
      const pendingReasonEl = document.createElement('span')
      pendingReasonEl.className = 'task-pending-reason'
      pendingReasonEl.textContent = pendingReasonLabel
      pendingReasonEl.title = pendingReasonRaw
      meta.appendChild(pendingReasonEl)
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
        : ''

    appendMetaTime(meta, 'task-time', changeAt)

    titleRow.appendChild(status)
    titleRow.appendChild(title)
    const actions = createTaskActions({ titleText, taskId, isCancelable })

    link.appendChild(titleRow)
    link.appendChild(meta)
    item.appendChild(link)
    if (actions) item.appendChild(actions)

    tasksList.appendChild(item)
  }
  restoreListScrollState(tasksList, previousScrollState)
}
