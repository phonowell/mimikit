import { renderEmptyListState } from './list-empty.js'
import { captureListScrollState, restoreListScrollState } from './list-scroll-sync.js'
import { appendMetaTime } from './meta-time.js'
import { UI_TEXT } from './system-text.js'

const normalizeText = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const resolveSnapshot = (item) => {
  if (item?.snapshot && typeof item.snapshot === 'object') return item.snapshot
  if (item && typeof item === 'object') return item
  return null
}

const resolveSummary = (item) => {
  const snapshot = resolveSnapshot(item)
  const summary = normalizeText(snapshot?.summary)
  return summary || ''
}

const resolveOpenItems = (item) => {
  const snapshot = resolveSnapshot(item)
  const openItemsRaw = Array.isArray(snapshot?.openItems) ? snapshot.openItems : []
  const openItems = []
  for (const entry of openItemsRaw) {
    if (typeof entry === 'string') {
      const normalized = normalizeText(entry)
      if (normalized) openItems.push(normalized)
      continue
    }
    if (!entry || typeof entry !== 'object') continue
    const objectEntry = entry
    const normalized = normalizeText(
      objectEntry.text ??
        objectEntry.title ??
        objectEntry.label ??
        objectEntry.detail ??
        objectEntry.summary,
    )
    if (normalized) openItems.push(normalized)
  }
  return openItems
}

const BOTTOM_SCROLL_THRESHOLD_MULTIPLIER = 0.1

export const renderFocuses = (focusesList, data) => {
  if (!focusesList) return
  const previousScrollState = captureListScrollState(focusesList, {
    bottomThresholdMultiplier: BOTTOM_SCROLL_THRESHOLD_MULTIPLIER,
  })
  const items = data?.items || []
  if (items.length === 0) {
    renderEmptyListState(focusesList, 'focuses-empty', UI_TEXT.noFocuses)
    restoreListScrollState(focusesList, previousScrollState)
    return
  }
  focusesList.innerHTML = ''

  for (const item of items) {
    const node = document.createElement('li')
    node.className = 'focus-item'
    const status = typeof item.status === 'string' ? item.status : 'idle'
    const taskId =
      typeof item.lastTaskId === 'string' ? item.lastTaskId.trim() : ''
    const canOpenArchive = taskId.length > 0
    node.dataset.status = status

    const link = document.createElement(canOpenArchive ? 'a' : 'div')
    link.className = 'focus-link'
    link.dataset.status = status
    if (canOpenArchive) {
      link.href = '#'
      link.setAttribute('data-task-id', taskId)
      link.setAttribute('data-archive-openable', 'true')
    }

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
    link.appendChild(header)

    const summary = resolveSummary(item)
    if (summary) {
      const summaryEl = document.createElement('p')
      summaryEl.className = 'focus-summary'
      summaryEl.textContent = summary
      link.appendChild(summaryEl)
    }

    const openItems = resolveOpenItems(item)
    if (openItems.length > 0) {
      const openItemsTitle = document.createElement('p')
      openItemsTitle.className = 'focus-open-items-title'
      openItemsTitle.textContent = UI_TEXT.focusOpenItemsLabel
      link.appendChild(openItemsTitle)

      const openItemsList = document.createElement('ul')
      openItemsList.className = 'focus-open-items'
      for (const openItem of openItems) {
        const openItemNode = document.createElement('li')
        openItemNode.className = 'focus-open-item'
        openItemNode.textContent = openItem
        openItemsList.appendChild(openItemNode)
      }
      link.appendChild(openItemsList)
    }

    const meta = document.createElement('small')
    meta.className = 'focus-meta'

    const changedAt =
      typeof item.lastActivityAt === 'string' && item.lastActivityAt.trim()
        ? item.lastActivityAt
        : typeof item.updatedAt === 'string' && item.updatedAt.trim()
          ? item.updatedAt
          : ''
    appendMetaTime(meta, 'focus-time', changedAt)

    if (meta.childElementCount > 0) link.appendChild(meta)
    node.appendChild(link)
    focusesList.appendChild(node)
  }

  restoreListScrollState(focusesList, previousScrollState)
}
