import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'
import { renderIntents } from './intents-view.js'

const EMPTY_INTENTS = { items: [] }

const normalizeIntentsPayload = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_INTENTS
  const items = Array.isArray(value.items) ? value.items : []
  return { items }
}

export function bindIntentsPanel({
  intentsList,
  intentsDialog,
  intentsOpenBtn,
  intentsCloseBtn,
}) {
  if (!intentsList) {
    return {
      applyIntentsSnapshot: () => {},
      setDisconnected: () => {},
      dispose: () => {},
    }
  }

  let latestIntents = EMPTY_INTENTS

  const renderLatestIntents = () => {
    renderIntents(intentsList, latestIntents)
  }

  const applyIntentsSnapshot = (payload) => {
    latestIntents = normalizeIntentsPayload(payload)
    renderLatestIntents()
  }

  const setDisconnected = () => {
    intentsList.innerHTML = ''
    const empty = document.createElement('li')
    empty.className = 'intents-empty'
    const article = document.createElement('article')
    article.textContent = UI_TEXT.connectionLost
    empty.appendChild(article)
    intentsList.appendChild(empty)
  }

  const dialogEnabled = Boolean(intentsDialog && intentsOpenBtn)
  const dialog = dialogEnabled
    ? createDialogController({
        dialog: intentsDialog,
        trigger: intentsOpenBtn,
        focusOnOpen: intentsCloseBtn,
        focusOnClose: intentsOpenBtn,
        onOpen: renderLatestIntents,
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
    intentsOpenBtn.addEventListener('click', onOpen)
    if (intentsCloseBtn) intentsCloseBtn.addEventListener('click', onClose)
    intentsDialog.addEventListener('click', onDialogClick)
    intentsDialog.addEventListener('cancel', onDialogCancel)
    intentsDialog.addEventListener('close', onDialogClose)
  } else renderLatestIntents()

  return {
    applyIntentsSnapshot,
    setDisconnected,
    dispose: () => {
      if (dialogEnabled && dialog) {
        intentsOpenBtn.removeEventListener('click', onOpen)
        if (intentsCloseBtn) intentsCloseBtn.removeEventListener('click', onClose)
        intentsDialog.removeEventListener('click', onDialogClick)
        intentsDialog.removeEventListener('cancel', onDialogCancel)
        intentsDialog.removeEventListener('close', onDialogClose)
      }
    },
  }
}


