import { formatTime } from './messages/format.js'
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

export const renderTodos = (todosList, data) => {
  if (!todosList) return
  const items = data?.items || []
  todosList.innerHTML = ''

  if (items.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'todos-empty'
    const article = document.createElement('article')
    article.textContent = UI_TEXT.noTodos
    empty.appendChild(article)
    todosList.appendChild(empty)
    return
  }

  for (const item of items) {
    const node = document.createElement('li')
    node.className = 'todo-item'
    const status = typeof item.status === 'string' ? item.status : 'pending'
    node.dataset.status = status

    const header = document.createElement('div')
    header.className = 'todo-title-row'

    const dot = document.createElement('span')
    dot.className = 'todo-status'
    dot.dataset.status = status
    dot.setAttribute('aria-hidden', 'true')

    const title = document.createElement('span')
    title.className = 'todo-title'
    title.textContent =
      typeof item.title === 'string' && item.title.trim()
        ? item.title
        : UI_TEXT.untitledTask

    const priority = document.createElement('span')
    priority.className = 'todo-priority'
    priority.textContent =
      PRIORITY_TEXT[
        typeof item.priority === 'string' ? item.priority : 'normal'
      ] ?? 'NORMAL'

    header.appendChild(dot)
    header.appendChild(title)
    header.appendChild(priority)

    const meta = document.createElement('small')
    meta.className = 'todo-meta'

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
      const time = document.createElement('span')
      time.className = 'todo-time'
      time.textContent = formatTime(changedAt)
      meta.appendChild(time)
    }

    node.appendChild(header)
    node.appendChild(meta)
    todosList.appendChild(node)
  }
}

