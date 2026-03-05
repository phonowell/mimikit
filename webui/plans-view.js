import { renderEmptyListState } from './list-empty.js'
import { captureListScrollState, restoreListScrollState } from './list-scroll-sync.js'
import { formatDisplayTimeWithFull } from './messages/format-time.js'
import { appendMetaTime } from './meta-time.js'
import { UI_TEXT } from './system-text.js'

const resolveTriggerLabel = (item) => {
  const trigger = item?.trigger
  if (!trigger || typeof trigger !== 'object') return null
  if (trigger.mode === 'scheduled_at') {
    const scheduledAt =
      typeof trigger.scheduledAt === 'string' ? trigger.scheduledAt.trim() : ''
    if (!scheduledAt) return null
    const display = formatDisplayTimeWithFull(scheduledAt, {
      relative: false,
      calendarWords: true,
    })
    return {
      text: display.displayText || (display.fullText ? '' : scheduledAt),
      title: display.fullText || scheduledAt,
    }
  }
  if (trigger.mode === 'cron') {
    const cron = typeof trigger.cron === 'string' ? trigger.cron.trim() : ''
    if (!cron) return null
    return { text: `cron:${cron}`, title: `cron: ${cron}` }
  }
  if (trigger.mode === 'on_idle') {
    const cooldownMs =
      typeof trigger.cooldownMs === 'number' && Number.isFinite(trigger.cooldownMs)
        ? Math.max(0, Math.floor(trigger.cooldownMs))
        : 0
    const cooldownSeconds = Math.floor(cooldownMs / 1000)
    return {
      text: `idle/${cooldownSeconds}s`,
      title: `on_idle cooldown: ${cooldownMs}ms`,
    }
  }
  return null
}

const BOTTOM_SCROLL_THRESHOLD_MULTIPLIER = 0.1

export const renderPlans = (plansList, data) => {
  if (!plansList) return
  const previousScrollState = captureListScrollState(plansList, {
    bottomThresholdMultiplier: BOTTOM_SCROLL_THRESHOLD_MULTIPLIER,
  })
  const items = data?.items || []
  if (items.length === 0) {
    renderEmptyListState(plansList, 'plans-empty', UI_TEXT.noPlans)
    restoreListScrollState(plansList, previousScrollState)
    return
  }
  plansList.innerHTML = ''

  for (const item of items) {
    const node = document.createElement('li')
    node.className = 'plan-item'
    const status = typeof item.status === 'string' ? item.status : 'active'
    const taskId =
      typeof item.lastTaskId === 'string' ? item.lastTaskId.trim() : ''
    const canOpenArchive = taskId.length > 0
    node.dataset.status = status

    const link = document.createElement(canOpenArchive ? 'a' : 'div')
    link.className = 'plan-link'
    if (canOpenArchive) {
      link.href = '#'
      link.setAttribute('data-task-id', taskId)
      link.setAttribute('data-archive-openable', 'true')
    }

    const header = document.createElement('div')
    header.className = 'plan-title-row'

    const dot = document.createElement('span')
    dot.className = 'plan-status'
    dot.dataset.status = status
    dot.setAttribute('aria-hidden', 'true')

    const title = document.createElement('span')
    title.className = 'plan-title'
    title.textContent =
      typeof item.title === 'string' && item.title.trim()
        ? item.title
        : UI_TEXT.untitledTask

    header.appendChild(dot)
    header.appendChild(title)

    const meta = document.createElement('small')
    meta.className = 'plan-meta'

    const triggerLabel = resolveTriggerLabel(item)
    if (triggerLabel) {
      const triggerEl = document.createElement('span')
      triggerEl.className = 'plan-trigger'
      triggerEl.textContent = triggerLabel.text
      triggerEl.title = triggerLabel.title
      meta.appendChild(triggerEl)
    }

    const changedAt =
      typeof item.archivedAt === 'string' && item.archivedAt.trim()
        ? item.archivedAt
        : typeof item.updatedAt === 'string' && item.updatedAt.trim()
          ? item.updatedAt
          : ''
    appendMetaTime(meta, 'plan-time', changedAt)

    link.appendChild(header)
    if (meta.childElementCount > 0) link.appendChild(meta)
    node.appendChild(link)
    plansList.appendChild(node)
  }

  restoreListScrollState(plansList, previousScrollState)
}
