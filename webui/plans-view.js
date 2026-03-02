import { renderEmptyListState } from './list-empty.js'
import { appendMetaTime } from './meta-time.js'
import { UI_TEXT } from './system-text.js'

const PRIORITY_TEXT = Object.freeze({
  high: 'HIGH',
  normal: 'NORMAL',
  low: 'LOW',
})

const STATUS_TEXT = Object.freeze({
  active: 'active',
  blocked: 'blocked',
  done: 'done',
})

const formatAttempt = (item) => {
  const runCount =
    typeof item?.runCount === 'number' && Number.isFinite(item.runCount)
      ? item.runCount
      : 0
  const maxRuns =
    typeof item?.maxRuns === 'number' && Number.isFinite(item.maxRuns)
      ? item.maxRuns
      : 0
  if (maxRuns <= 0) return ''
  return `${runCount}/${maxRuns}`
}

export const renderPlans = (plansList, data) => {
  if (!plansList) return
  const items = data?.items || []
  if (items.length === 0) {
    renderEmptyListState(plansList, 'plans-empty', UI_TEXT.noPlans)
    return
  }
  plansList.innerHTML = ''

  for (const item of items) {
    const node = document.createElement('li')
    node.className = 'plan-item'
    const status = typeof item.status === 'string' ? item.status : 'active'
    node.dataset.status = status

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

    const priority = document.createElement('span')
    priority.className = 'plan-priority'
    priority.textContent =
      PRIORITY_TEXT[
        typeof item.priority === 'string' ? item.priority : 'normal'
      ] ?? 'NORMAL'

    header.appendChild(dot)
    header.appendChild(title)
    header.appendChild(priority)

    const meta = document.createElement('small')
    meta.className = 'plan-meta'

    const statusEl = document.createElement('span')
    statusEl.textContent = STATUS_TEXT[status] ?? status
    meta.appendChild(statusEl)

    if (typeof item.source === 'string' && item.source.trim()) {
      const source = document.createElement('span')
      source.textContent = item.source
      meta.appendChild(source)
    }

    const attempt = formatAttempt(item)
    if (attempt) {
      const attemptEl = document.createElement('span')
      attemptEl.textContent = attempt
      meta.appendChild(attemptEl)
    }

    const changedAt =
      typeof item.archivedAt === 'string' && item.archivedAt.trim()
        ? item.archivedAt
        : typeof item.updatedAt === 'string' && item.updatedAt.trim()
          ? item.updatedAt
          : ''
    appendMetaTime(meta, 'plan-time', changedAt)

    node.appendChild(header)
    node.appendChild(meta)
    plansList.appendChild(node)
  }
}
