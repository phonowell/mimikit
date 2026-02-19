import { createDialogController } from './dialog.js'
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
  focusesDialog,
  focusesOpenBtn,
  focusesDotsEl,
  focusesCloseBtn,
  activeList,
  expiredList,
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
    syncActiveCountIndicator(latest.limit, latest.active.length)
    render()
  }

  const dialogEnabled = Boolean(focusesDialog && focusesOpenBtn)
  const dialog = dialogEnabled
    ? createDialogController({
        dialog: focusesDialog,
        trigger: focusesOpenBtn,
        focusOnOpen: focusesCloseBtn,
        focusOnClose: focusesOpenBtn,
      })
    : null

  const setDisconnected = () => {
    activeList.innerHTML = ''
    expiredList.innerHTML = ''
    const item = document.createElement('li')
    item.className = 'focus-empty'
    item.textContent = UI_TEXT.connectionLost
    activeList.appendChild(item)
    syncActiveCountIndicator(0, 0)
  }

  const normalizeCount = (value) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0

  const syncActiveCountIndicator = (limitValue, activeValue) => {
    const activeCount = normalizeCount(activeValue)
    const limitCount = normalizeCount(limitValue)
    const dotsCount = Math.max(limitCount, activeCount)
    if (focusesDotsEl) {
      if (dotsCount <= 0) focusesDotsEl.innerHTML = ''
      else if (focusesDotsEl.childElementCount !== dotsCount) {
        focusesDotsEl.innerHTML = ''
        for (let index = 0; index < dotsCount; index += 1) {
          const dot = document.createElement('span')
          dot.className = 'worker-dot'
          focusesDotsEl.appendChild(dot)
        }
      }
      const activeDots = Math.min(activeCount, dotsCount)
      const dots = focusesDotsEl.querySelectorAll('.worker-dot')
      for (let index = 0; index < dots.length; index += 1) {
        const dot = dots[index]
        if (!(dot instanceof HTMLElement)) continue
        dot.dataset.active = index < activeDots ? 'true' : 'false'
      }
    }
    if (focusesOpenBtn) {
      const label = activeCount > 0 ? `Focuses (${activeCount} active)` : 'Focuses'
      focusesOpenBtn.setAttribute('title', label)
      focusesOpenBtn.setAttribute('aria-label', label)
    }
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
    }
  }

  const onOpen = (event) => {
    event.preventDefault()
    if (dialog) dialog.open()
  }
  const onClose = (event) => {
    event.preventDefault()
    if (dialog) dialog.close()
  }
  const onDialogClick = (event) => {
    if (dialog) dialog.handleDialogClick(event)
  }
  const onDialogClose = () => {
    if (dialog) dialog.handleDialogClose()
  }
  const onDialogCancel = (event) => {
    if (dialog) dialog.handleDialogCancel(event)
  }

  panel?.addEventListener('click', onClick)
  syncActiveCountIndicator(0, 0)
  if (dialogEnabled && dialog) {
    dialog.setExpanded(false)
    focusesOpenBtn.addEventListener('click', onOpen)
    if (focusesCloseBtn) focusesCloseBtn.addEventListener('click', onClose)
    focusesDialog.addEventListener('click', onDialogClick)
    focusesDialog.addEventListener('cancel', onDialogCancel)
    focusesDialog.addEventListener('close', onDialogClose)
  }

  return {
    applyFocusSnapshot,
    setDisconnected,
    dispose: () => {
      panel?.removeEventListener('click', onClick)
      if (dialogEnabled && dialog) {
        focusesOpenBtn.removeEventListener('click', onOpen)
        if (focusesCloseBtn) focusesCloseBtn.removeEventListener('click', onClose)
        focusesDialog.removeEventListener('click', onDialogClick)
        focusesDialog.removeEventListener('cancel', onDialogCancel)
        focusesDialog.removeEventListener('close', onDialogClose)
      }
    },
  }
}
