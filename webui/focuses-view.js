const asPercent = (value) => {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%`
}

const formatTime = (value) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return ''
  return new Date(parsed).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const createFocusItem = (focus, action) => {
  const item = document.createElement('li')
  item.className = 'focus-item'
  const title = document.createElement('div')
  title.className = 'focus-title'
  title.textContent = focus.title

  const summary = document.createElement('p')
  summary.className = 'focus-summary'
  summary.textContent = focus.summary

  const meta = document.createElement('small')
  meta.className = 'focus-meta'
  const updated = formatTime(focus.updatedAt)
  meta.textContent = updated
    ? `${asPercent(focus.confidence)} · ${updated}`
    : asPercent(focus.confidence)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'focus-action'
  button.setAttribute('data-focus-id', focus.id)
  button.setAttribute('data-focus-action', action)
  button.textContent = action === 'expire' ? 'Expire' : 'Restore'

  const row = document.createElement('div')
  row.className = 'focus-row'
  row.appendChild(title)
  row.appendChild(button)

  item.appendChild(row)
  item.appendChild(summary)
  item.appendChild(meta)
  return item
}

const renderEmpty = (listEl, text) => {
  listEl.innerHTML = ''
  const item = document.createElement('li')
  item.className = 'focus-empty'
  item.textContent = text
  listEl.appendChild(item)
}

export const renderFocuses = (params) => {
  const { activeListEl, expiredListEl, data } = params
  if (!activeListEl || !expiredListEl) return
  const active = Array.isArray(data?.active) ? data.active : []
  const expired = Array.isArray(data?.expired) ? data.expired : []

  activeListEl.innerHTML = ''
  for (const focus of active)
    activeListEl.appendChild(createFocusItem(focus, 'expire'))

  if (active.length === 0) renderEmpty(activeListEl, 'No active focus')

  expiredListEl.innerHTML = ''
  for (const focus of expired)
    expiredListEl.appendChild(createFocusItem(focus, 'restore'))

  if (expired.length === 0) renderEmpty(expiredListEl, 'No expired focus')
}
