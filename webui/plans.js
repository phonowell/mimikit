import { createDialogController } from './dialog.js'
import { UI_TEXT } from './system-text.js'
import { renderPlans } from './plans-view.js'
import { subscribeTimeTick } from './time-tick.js'

const EMPTY_PLANS = { items: [] }

const normalizePlansPayload = (value) => {
  if (!value || typeof value !== 'object') return EMPTY_PLANS
  const items = Array.isArray(value.items) ? value.items : []
  return { items }
}

export function bindPlansPanel({
  plansList,
  plansDialog,
  plansOpenBtn,
  plansCloseBtn,
}) {
  if (!plansList) {
    return {
      applyPlansSnapshot: () => {},
      setDisconnected: () => {},
      dispose: () => {},
    }
  }

  let latestPlans = EMPTY_PLANS
  let unsubscribeTimeTick = null

  const renderLatestPlans = () => {
    renderPlans(plansList, latestPlans)
  }

  const startTimeTick = () => {
    if (unsubscribeTimeTick) return
    unsubscribeTimeTick = subscribeTimeTick(() => {
      renderLatestPlans()
    })
  }

  const stopTimeTick = () => {
    if (!unsubscribeTimeTick) return
    unsubscribeTimeTick()
    unsubscribeTimeTick = null
  }

  const applyPlansSnapshot = (payload) => {
    latestPlans = normalizePlansPayload(payload)
    renderLatestPlans()
  }

  const setDisconnected = () => {
    plansList.innerHTML = ''
    const empty = document.createElement('li')
    empty.className = 'plans-empty'
    const article = document.createElement('article')
    article.textContent = UI_TEXT.connectionLost
    empty.appendChild(article)
    plansList.appendChild(empty)
  }

  const dialogEnabled = Boolean(plansDialog && plansOpenBtn)
  const dialog = dialogEnabled
    ? createDialogController({
        dialog: plansDialog,
        trigger: plansOpenBtn,
        focusOnOpen: plansCloseBtn,
        focusOnClose: plansOpenBtn,
        onOpen: () => {
          startTimeTick()
          renderLatestPlans()
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
    plansOpenBtn.addEventListener('click', onOpen)
    if (plansCloseBtn) plansCloseBtn.addEventListener('click', onClose)
    plansDialog.addEventListener('click', onDialogClick)
    plansDialog.addEventListener('cancel', onDialogCancel)
    plansDialog.addEventListener('close', onDialogClose)
  } else {
    startTimeTick()
    renderLatestPlans()
  }

  return {
    applyPlansSnapshot,
    setDisconnected,
    dispose: () => {
      stopTimeTick()
      if (dialogEnabled && dialog) {
        plansOpenBtn.removeEventListener('click', onOpen)
        if (plansCloseBtn) plansCloseBtn.removeEventListener('click', onClose)
        plansDialog.removeEventListener('click', onDialogClick)
        plansDialog.removeEventListener('cancel', onDialogCancel)
        plansDialog.removeEventListener('close', onDialogClose)
      }
    },
  }
}
