import { renderEmptyListState } from './list-empty.js'
import { appendMetaTime } from './meta-time.js'
import { UI_TEXT } from './system-text.js'

const STATUS_TEXT = Object.freeze({
  active: 'active',
  idle: 'idle',
  done: 'done',
  archived: 'archived',
})

const normalizeOpenItems = (items) =>
  Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    : []

export const renderFocuses = (focusesList, data) => {
  if (!focusesList) return
  const items = data?.items || []
  if (items.length === 0) {
    renderEmptyListState(focusesList, 'focuses-empty', UI_TEXT.noFocuses)
    return
  }
  focusesList.innerHTML = ''

  for (const item of items) {
    const node = document.createElement('li')
    node.className = 'focus-item'
    const status = typeof item.status === 'string' ? item.status : 'idle'
    node.dataset.status = status
    if (item.isActive) node.dataset.active = 'true'

    const header = document.createElement('div')
    header.className = 'focus-title-row'

    const dot = document.createElement('span')
    dot.className = 'focus-status'
    dot.dataset.status = status
    dot.setAttribute('aria-hidden', 'true')

    const title = document.createElement('span')
    title.className = 'focus-title'
    title.textContent =
      typeof item.title === 'string' && item.title.trim()
        ? item.title
        : typeof item.id === 'string' && item.id.trim()
          ? item.id
          : UI_TEXT.untitledTask

    const state = document.createElement('span')
    state.className = 'focus-state'
    state.textContent = STATUS_TEXT[status] ?? status

    header.appendChild(dot)
    header.appendChild(title)
    header.appendChild(state)

    if (item.isActive) {
      const active = document.createElement('span')
      active.className = 'focus-active-badge'
      active.textContent = 'ACTIVE'
      header.appendChild(active)
    }

    node.appendChild(header)

    if (typeof item.summary === 'string' && item.summary.trim()) {
      const summary = document.createElement('p')
      summary.className = 'focus-summary'
      summary.textContent = item.summary
      node.appendChild(summary)
    }

    const openItems = normalizeOpenItems(item.openItems)
    if (openItems.length > 0) {
      const openList = document.createElement('ul')
      openList.className = 'focus-open-items'
      for (const openItemText of openItems) {
        const openItem = document.createElement('li')
        openItem.className = 'focus-open-item'
        openItem.textContent = openItemText
        openList.appendChild(openItem)
      }
      node.appendChild(openList)
    }

    const meta = document.createElement('small')
    meta.className = 'focus-meta'

    const id = document.createElement('span')
    id.textContent = typeof item.id === 'string' ? item.id : ''
    meta.appendChild(id)

    const changedAt =
      typeof item.lastActivityAt === 'string' && item.lastActivityAt.trim()
        ? item.lastActivityAt
        : typeof item.updatedAt === 'string' && item.updatedAt.trim()
          ? item.updatedAt
          : ''
    appendMetaTime(meta, 'focus-time', changedAt)

    node.appendChild(meta)
    focusesList.appendChild(node)
  }
}
