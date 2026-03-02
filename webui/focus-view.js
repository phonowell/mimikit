import { renderEmptyListState } from './list-empty.js'
import { appendMetaTime } from './meta-time.js'
import { UI_TEXT } from './system-text.js'

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

    header.appendChild(dot)
    header.appendChild(title)

    node.appendChild(header)

    const meta = document.createElement('small')
    meta.className = 'focus-meta'

    const changedAt =
      typeof item.lastActivityAt === 'string' && item.lastActivityAt.trim()
        ? item.lastActivityAt
        : typeof item.updatedAt === 'string' && item.updatedAt.trim()
          ? item.updatedAt
          : ''
    appendMetaTime(meta, 'focus-time', changedAt)

    if (meta.childElementCount > 0) node.appendChild(meta)
    focusesList.appendChild(node)
  }
}
