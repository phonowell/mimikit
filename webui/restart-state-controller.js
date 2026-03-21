import { MODE_BLOCKED_LABEL, NON_IDLE_BLOCK_REASON, NON_IDLE_UI_HINT } from './restart-config.js'
import { setStatusState, setStatusText } from './status.js'

const rememberTitles = (elements) => {
  const titleByElement = new Map()
  for (const element of elements) {
    if (!element || titleByElement.has(element)) continue
    titleByElement.set(element, element.getAttribute('title') || '')
  }
  return titleByElement
}

const setBlockedTitle = (element, blocked, titleByElement) => {
  if (!element) return
  if (blocked) {
    element.setAttribute('title', NON_IDLE_UI_HINT)
    return
  }
  const original = titleByElement.get(element) ?? ''
  if (original) element.setAttribute('title', original)
  else element.removeAttribute('title')
}

export const createRestartStateController = ({
  controls,
  statusText,
  statusDot,
  messages,
  toolsMenuController,
  closeDialogs,
} = {}) => {
  let isBusy = false
  let isRuntimeIdle = true

  const titleByElement = rememberTitles([
    controls.toolsToggleBtn,
    controls.toolsRestartBtn,
    controls.toolsResetBtn,
    controls.restartConfirmBtn,
    controls.resetConfirmBtn,
  ])

  const syncControlState = () => {
    const blockedByIdle = !isRuntimeIdle
    const disableActions = isBusy

    if (controls.toolsRestartBtn) controls.toolsRestartBtn.disabled = disableActions
    if (controls.toolsResetBtn) controls.toolsResetBtn.disabled = disableActions
    if (controls.toolsToggleBtn) controls.toolsToggleBtn.disabled = isBusy
    if (controls.restartCancelBtn) controls.restartCancelBtn.disabled = isBusy
    if (controls.restartConfirmBtn) controls.restartConfirmBtn.disabled = disableActions
    if (controls.resetCancelBtn) controls.resetCancelBtn.disabled = isBusy
    if (controls.resetConfirmBtn) controls.resetConfirmBtn.disabled = disableActions
    toolsMenuController?.setDisabled(isBusy)

    setBlockedTitle(controls.toolsRestartBtn, blockedByIdle, titleByElement)
    setBlockedTitle(controls.toolsResetBtn, blockedByIdle, titleByElement)
    setBlockedTitle(controls.restartConfirmBtn, blockedByIdle, titleByElement)
    setBlockedTitle(controls.resetConfirmBtn, blockedByIdle, titleByElement)
    setBlockedTitle(controls.toolsToggleBtn, blockedByIdle, titleByElement)

  }

  const readUiIdleState = () => {
    if (messages && typeof messages.isFullyIdle === 'function')
      return messages.isFullyIdle()
    return statusDot?.dataset?.state?.trim().toLowerCase() === 'idle'
  }

  const refreshUiIdleState = () => {
    isRuntimeIdle = readUiIdleState()
    syncControlState()
    return isRuntimeIdle
  }

  return {
    isBusy: () => isBusy,
    setBusy: (value) => {
      isBusy = Boolean(value)
    },
    setRuntimeIdle: (value) => {
      isRuntimeIdle = Boolean(value)
    },
    syncControlState,
    refreshUiIdleState,
    closeToolsMenu: (options) => toolsMenuController?.close(options),
    closeAllDialogs: () => closeDialogs?.(),
  }
}
