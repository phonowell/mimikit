import {
  formatDateTimeFull,
  formatDisplayTimeWithFull,
  formatElapsedLabel,
  parseTimeInput,
  formatUsage,
} from './messages/format.js'
import { UI_TEXT, resolveTaskStatusLabel } from './system-text.js'

const ELAPSED_TICK_MS = 1000
const toTimeMs = (value) => {
  const parsed = parseTimeInput(value)
  return parsed ? parsed.getTime() : null
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

const resolveProfileText = () => 'worker'

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
    text: schedulePair.displayText || raw,
    title: `scheduled: ${scheduleTitle}`,
  }
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
    const taskId = typeof task.id === 'string' ? task.id.trim() : ''
    item.dataset.status = statusValue
    item.dataset.profile = profileValue

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
    const dotTitle = `${statusValue}/${profileValue}`
    status.setAttribute('role', 'img')
    status.setAttribute('aria-label', `${statusLabel} · profile ${profileValue}`)
    status.title = dotTitle

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

    const usageDisplay = formatUsage(task.usage)
    const usageText = usageDisplay?.text ?? ''
    const hasUsage = Boolean(usageText)

    if (usageText) {
      const tokensEl = document.createElement('span')
      tokensEl.className = 'task-tokens'
      tokensEl.textContent = usageText
      if (usageDisplay?.title) tokensEl.title = usageDisplay.title
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
      const changeDisplay = formatDisplayTimeWithFull(changeAt)
      const timeEl = document.createElement('span')
      timeEl.className = 'task-time'
      timeEl.textContent = changeDisplay.displayText || changeAt
      timeEl.title = changeDisplay.fullText || changeAt
      meta.appendChild(timeEl)
    }

    titleRow.appendChild(status)
    titleRow.appendChild(title)
    const actions = document.createElement('div')
    actions.className = 'task-item-actions'

    const moreBtn = document.createElement('button')
    moreBtn.type = 'button'
    moreBtn.className = 'btn btn--icon btn--icon-muted task-more'
    moreBtn.textContent = '⋯'
    moreBtn.setAttribute('aria-label', `More actions for ${titleText}`)
    moreBtn.setAttribute('title', `More actions for ${titleText}`)
    moreBtn.setAttribute('aria-haspopup', 'menu')
    moreBtn.setAttribute('aria-expanded', 'false')

    const menu = document.createElement('div')
    menu.className = 'task-menu'
    menu.setAttribute('role', 'menu')

    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'task-menu-item task-cancel'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.setAttribute('role', 'menuitem')
    cancelBtn.setAttribute('data-task-id', taskId)
    cancelBtn.setAttribute('title', `Cancel ${titleText}`)
    cancelBtn.setAttribute('aria-label', `Cancel ${titleText}`)
    if (!isCancelable || taskId.length === 0) cancelBtn.disabled = true

    menu.appendChild(cancelBtn)
    actions.appendChild(moreBtn)
    actions.appendChild(menu)
    titleRow.appendChild(actions)

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
