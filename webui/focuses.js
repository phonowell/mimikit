import { UI_TEXT } from './system-text.js'
import { renderFocuses } from './focuses-view.js'

const EMPTY = { limit: 0, active: [], expired: [] }

const normalizePayload = (value) => {
  if (!value || typeof value !== 'object') return EMPTY
  const active = Array.isArray(value.active) ? value.active : []
  const expired = Array.isArray(value.expired) ? value.expired : []
  const limit =
    typeof value.limit === 'number' && Number.isFinite(value.limit) ? value.limit : 0
  return { limit, active, expired }
}

const requestAction = async (url) => {
  const response = await fetch(url, { method: 'POST' })
  if (response.ok) return true
  let error = `HTTP ${response.status}`
  try {
    const data = await response.json()
    if (data?.error) error = String(data.error)
  } catch {
    // no-op
  }
  throw new Error(error)
}

export const bindFocusPanel = ({
  activeList,
  expiredList,
  rollbackBtn,
  panel,
}) => {
  if (!activeList || !expiredList) {
    return {
      applyFocusSnapshot: () => {},
      setDisconnected: () => {},
      dispose: () => {},
    }
  }

  let latest = EMPTY

  const render = () => {
    renderFocuses({
      activeListEl: activeList,
      expiredListEl: expiredList,
      data: latest,
    })
  }

  const applyFocusSnapshot = (payload) => {
    latest = normalizePayload(payload)
    render()
  }

  const setDisconnected = () => {
    activeList.innerHTML = ''
    expiredList.innerHTML = ''
    const item = document.createElement('li')
    item.className = 'focus-empty'
    item.textContent = UI_TEXT.connectionLost
    activeList.appendChild(item)
  }

  const onClick = (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const actionButton = target.closest('[data-focus-action]')
    if (actionButton instanceof HTMLButtonElement) {
      event.preventDefault()
      const focusId = actionButton.getAttribute('data-focus-id') || ''
      const action = actionButton.getAttribute('data-focus-action') || ''
      if (!focusId || !action) return
      actionButton.disabled = true
      const endpoint =
        action === 'restore'
          ? `/api/focuses/${encodeURIComponent(focusId)}/restore`
          : `/api/focuses/${encodeURIComponent(focusId)}/expire`
      void requestAction(endpoint)
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          console.warn('[webui] focus action failed', message)
        })
        .finally(() => {
          actionButton.disabled = false
        })
      return
    }

    if (
      rollbackBtn &&
      target instanceof Element &&
      target.closest('[data-focuses-rollback]')
    ) {
      event.preventDefault()
      rollbackBtn.disabled = true
      void requestAction('/api/focuses/rollback')
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          console.warn('[webui] focus rollback failed', message)
        })
        .finally(() => {
          rollbackBtn.disabled = false
        })
    }
  }

  panel?.addEventListener('click', onClick)

  return {
    applyFocusSnapshot,
    setDisconnected,
    dispose: () => panel?.removeEventListener('click', onClick),
  }
}
