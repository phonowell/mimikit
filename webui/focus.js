import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'
import { renderFocuses } from './focus-view.js'
import { subscribeTimeTick } from './time-tick.js'

const EMPTY_FOCUSES = { items: [] }

const normalizeFocusesPayload = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_FOCUSES
  const items = Array.isArray(value.items) ? value.items : []
  return { items }
}

export function bindFocusPanel({
  focusesList,
  focusesDialog,
  focusesOpenBtn,
  focusesCloseBtn,
}) {
  if (!focusesList) {
    return {
      applyFocusesSnapshot: () => {},
      setDisconnected: () => {},
      dispose: () => {},
    }
  }

  let latestFocuses = EMPTY_FOCUSES
  let unsubscribeTimeTick = null

  const renderLatestFocuses = () => {
    renderFocuses(focusesList, latestFocuses)
  }

  const startTimeTick = () => {
    if (unsubscribeTimeTick) return
    unsubscribeTimeTick = subscribeTimeTick(() => {
      renderLatestFocuses()
    })
  }

  const stopTimeTick = () => {
    if (!unsubscribeTimeTick) return
    unsubscribeTimeTick()
    unsubscribeTimeTick = null
  }

  const applyFocusesSnapshot = (payload) => {
    latestFocuses = normalizeFocusesPayload(payload)
    renderLatestFocuses()
  }

  const setDisconnected = () => {
    focusesList.innerHTML = ''
    const empty = document.createElement('li')
    empty.className = 'focuses-empty'
    const article = document.createElement('article')
    article.textContent = UI_TEXT.connectionLost
    empty.appendChild(article)
    focusesList.appendChild(empty)
  }

  const dialogEnabled = Boolean(focusesDialog && focusesOpenBtn)
  const dialog = dialogEnabled
    ? createDialogController({
        dialog: focusesDialog,
        trigger: focusesOpenBtn,
        focusOnOpen: focusesCloseBtn,
        focusOnClose: focusesOpenBtn,
        onOpen: () => {
          startTimeTick()
          renderLatestFocuses()
        },
        onAfterClose: stopTimeTick,
      })
    : null

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

  if (dialogEnabled && dialog) {
    dialog.setExpanded(false)
    focusesOpenBtn.addEventListener('click', onOpen)
    if (focusesCloseBtn) focusesCloseBtn.addEventListener('click', onClose)
    focusesDialog.addEventListener('click', onDialogClick)
    focusesDialog.addEventListener('cancel', onDialogCancel)
    focusesDialog.addEventListener('close', onDialogClose)
  } else {
    startTimeTick()
    renderLatestFocuses()
  }

  return {
    applyFocusesSnapshot,
    setDisconnected,
    dispose: () => {
      stopTimeTick()
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
