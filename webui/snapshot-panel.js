import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'
import { subscribeTimeTick } from './time-tick.js'

const EMPTY_PANEL = {
  applySnapshot: () => {},
  setDisconnected: () => {},
  dispose: () => {},
}

export const bindSnapshotPanel = ({
  list,
  dialog,
  openBtn,
  closeBtn,
  render,
  normalizePayload,
  emptyClass,
}) => {
  if (!list || typeof render !== 'function' || typeof normalizePayload !== 'function')
    return EMPTY_PANEL

  let latestPayload = normalizePayload(null)
  let unsubscribeTimeTick = null

  const renderLatest = () => {
    render(list, latestPayload)
  }

  const startTimeTick = () => {
    if (unsubscribeTimeTick) return
    unsubscribeTimeTick = subscribeTimeTick(() => {
      renderLatest()
    })
  }

  const stopTimeTick = () => {
    if (!unsubscribeTimeTick) return
    unsubscribeTimeTick()
    unsubscribeTimeTick = null
  }

  const applySnapshot = (payload) => {
    latestPayload = normalizePayload(payload)
    renderLatest()
  }

  const setDisconnected = () => {
    list.innerHTML = ''
    const empty = document.createElement('li')
    empty.className = emptyClass
    const article = document.createElement('article')
    article.textContent = UI_TEXT.connectionLost
    empty.appendChild(article)
    list.appendChild(empty)
  }

  const dialogEnabled = Boolean(dialog && openBtn)
  const controller = dialogEnabled
    ? createDialogController({
        dialog,
        trigger: openBtn,
        focusOnOpen: closeBtn,
        focusOnClose: openBtn,
        onOpen: () => {
          startTimeTick()
          renderLatest()
        },
        onAfterClose: stopTimeTick,
      })
    : null

  const onOpen = (event) => {
    event.preventDefault()
    if (controller) controller.open()
  }
  const onClose = (event) => {
    event.preventDefault()
    if (controller) controller.close()
  }
  const onDialogClick = (event) => {
    if (controller) controller.handleDialogClick(event)
  }
  const onDialogClose = () => {
    if (controller) controller.handleDialogClose()
  }
  const onDialogCancel = (event) => {
    if (controller) controller.handleDialogCancel(event)
  }

  if (dialogEnabled && controller) {
    controller.setExpanded(false)
    openBtn.addEventListener('click', onOpen)
    if (closeBtn) closeBtn.addEventListener('click', onClose)
    dialog.addEventListener('click', onDialogClick)
    dialog.addEventListener('cancel', onDialogCancel)
    dialog.addEventListener('close', onDialogClose)
  } else {
    startTimeTick()
    renderLatest()
  }

  return {
    applySnapshot,
    setDisconnected,
    dispose: () => {
      stopTimeTick()
      if (dialogEnabled && controller) {
        openBtn.removeEventListener('click', onOpen)
        if (closeBtn) closeBtn.removeEventListener('click', onClose)
        dialog.removeEventListener('click', onDialogClick)
        dialog.removeEventListener('cancel', onDialogCancel)
        dialog.removeEventListener('close', onDialogClose)
      }
    },
  }
}
