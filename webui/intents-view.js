import { formatDisplayTimeWithFull } from './messages/format.js'
import { UI_TEXT } from './system-text.js'

const PRIORITY_TEXT = Object.freeze({
  high: 'HIGH',
  normal: 'NORMAL',
  low: 'LOW',
})

const STATUS_TEXT = Object.freeze({
  pending: 'pending',
  blocked: 'blocked',
  done: 'done',
})

const formatAttempt = (item) => {
  const attempts =
    typeof item?.attempts === 'number' && Number.isFinite(item.attempts)
      ? item.attempts
      : 0
  const maxAttempts =
    typeof item?.maxAttempts === 'number' && Number.isFinite(item.maxAttempts)
      ? item.maxAttempts
      : 0
  if (maxAttempts <= 0) return ''
  return `${attempts}/${maxAttempts}`
}

export const renderIntents = (intentsList, data) => {
  if (!intentsList) return
  const items = data?.items || []
  intentsList.innerHTML = ''

  if (items.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'intents-empty'
    const article = document.createElement('article')
    article.textContent = UI_TEXT.noIntents
    empty.appendChild(article)
    intentsList.appendChild(empty)
    return
  }

  for (const item of items) {
    const node = document.createElement('li')
    node.className = 'intent-item'
    const status = typeof item.status === 'string' ? item.status : 'pending'
    node.dataset.status = status

    const header = document.createElement('div')
    header.className = 'intent-title-row'

    const dot = document.createElement('span')
    dot.className = 'intent-status'
    dot.dataset.status = status
    dot.setAttribute('aria-hidden', 'true')

    const title = document.createElement('span')
    title.className = 'intent-title'
    title.textContent =
      typeof item.title === 'string' && item.title.trim()
        ? item.title
        : UI_TEXT.untitledTask

    const priority = document.createElement('span')
    priority.className = 'intent-priority'
    priority.textContent =
      PRIORITY_TEXT[
        typeof item.priority === 'string' ? item.priority : 'normal'
      ] ?? 'NORMAL'

    header.appendChild(dot)
    header.appendChild(title)
    header.appendChild(priority)

    const meta = document.createElement('small')
    meta.className = 'intent-meta'

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
    if (changedAt) {
      const changedDisplay = formatDisplayTimeWithFull(changedAt)
      const time = document.createElement('span')
      time.className = 'intent-time'
      time.textContent = changedDisplay.displayText || changedAt
      time.title = changedDisplay.fullText || changedAt
      meta.appendChild(time)
    }

    node.appendChild(header)
    node.appendChild(meta)
    intentsList.appendChild(node)
  }
}

