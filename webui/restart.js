import { createDialogController } from './dialog.js'
import { bindRestartDialog } from './restart-dialog-binding.js'
import { createRestartRequester } from './restart-request.js'
import { createRestartStateController } from './restart-state-controller.js'
import { createToolsMenuController } from './restart-tools-menu.js'

export function bindRestart({
  toolsToggleBtn,
  toolsMenu,
  toolsRestartBtn,
  toolsResetBtn,
  restartDialog,
  restartCancelBtn,
  restartConfirmBtn,
  resetDialog,
  resetCancelBtn,
  resetConfirmBtn,
  statusText,
  statusDot,
  messages,
}) {
  const toolsEnabled = Boolean(toolsToggleBtn && toolsMenu && toolsRestartBtn && toolsResetBtn)
  if (!toolsEnabled) return

  const restartOpenBtn = toolsRestartBtn
  const resetOpenBtn = toolsResetBtn

  const toolsMenuController = toolsEnabled
    ? createToolsMenuController({ toolsToggleBtn, toolsMenu })
    : null

  const focusRestoreBtn = toolsToggleBtn
  const restartDialogController =
    restartDialog && restartOpenBtn && restartCancelBtn && restartConfirmBtn
      ? createDialogController({
          dialog: restartDialog,
          trigger: restartOpenBtn,
          focusOnOpen: restartCancelBtn,
          onAfterClose: () => {
            if (!state.isBusy() && focusRestoreBtn) focusRestoreBtn.focus()
          },
        })
      : null
  const resetDialogController =
    resetDialog && resetOpenBtn && resetCancelBtn && resetConfirmBtn
      ? createDialogController({
          dialog: resetDialog,
          trigger: resetOpenBtn,
          focusOnOpen: resetCancelBtn,
          onAfterClose: () => {
            if (!state.isBusy() && focusRestoreBtn) focusRestoreBtn.focus()
          },
        })
      : null
  restartDialogController?.setExpanded(false)
  resetDialogController?.setExpanded(false)

  const closeDialogs = () => {
    restartDialogController?.close()
    resetDialogController?.close()
  }

  const state = createRestartStateController({
    controls: {
      toolsToggleBtn,
      toolsRestartBtn,
      toolsResetBtn,
      restartCancelBtn,
      restartConfirmBtn,
      resetCancelBtn,
      resetConfirmBtn,
    },
    statusText,
    statusDot,
    messages,
    toolsMenuController,
    closeDialogs,
  })

  const requester = createRestartRequester({
    statusText,
    statusDot,
    messages,
    isBusy: state.isBusy,
    setBusy: state.setBusy,
    setRuntimeIdle: state.setRuntimeIdle,
    refreshUiIdleState: state.refreshUiIdleState,
    syncControlState: state.syncControlState,
    closeToolsMenu: state.closeToolsMenu,
    closeAllDialogs: state.closeAllDialogs,
  })

  const onOpenRestart = (event) => {
    event.preventDefault()
    if (state.isBusy()) return
    state.refreshUiIdleState()
    state.closeToolsMenu()
    resetDialogController?.close()
    if (restartDialogController) restartDialogController.open()
    else void requester.request('restart')
  }

  const onOpenReset = (event) => {
    event.preventDefault()
    if (state.isBusy()) return
    state.refreshUiIdleState()
    state.closeToolsMenu()
    restartDialogController?.close()
    if (resetDialogController) resetDialogController.open()
    else void requester.request('reset')
  }

  const onCancelRestart = (event) => {
    event.preventDefault()
    if (state.isBusy() || !restartDialogController) return
    restartDialogController.close()
  }
  const onCancelReset = (event) => {
    event.preventDefault()
    if (state.isBusy() || !resetDialogController) return
    resetDialogController.close()
  }
  const onConfirmRestart = (event) => {
    event.preventDefault()
    if (state.isBusy()) return
    void requester.request('restart')
  }
  const onConfirmReset = (event) => {
    event.preventDefault()
    if (state.isBusy()) return
    void requester.request('reset')
  }

  const restartBinding = bindRestartDialog({
    dialog: restartDialog,
    openBtn: restartOpenBtn,
    cancelBtn: restartCancelBtn,
    confirmBtn: restartConfirmBtn,
    dialogController: restartDialogController,
    onOpen: onOpenRestart,
    onCancel: onCancelRestart,
    onConfirm: onConfirmRestart,
  })
  const resetBinding = bindRestartDialog({
    dialog: resetDialog,
    openBtn: resetOpenBtn,
    cancelBtn: resetCancelBtn,
    confirmBtn: resetConfirmBtn,
    dialogController: resetDialogController,
    onOpen: onOpenReset,
    onCancel: onCancelReset,
    onConfirm: onConfirmReset,
  })

  const unbindToolsMenu = toolsMenuController?.bind?.() ?? (() => {})
  let statusObserver = null
  if (statusDot && typeof MutationObserver === 'function') {
    statusObserver = new MutationObserver(() => {
      state.refreshUiIdleState()
    })
    statusObserver.observe(statusDot, {
      attributes: true,
      attributeFilter: ['data-state'],
    })
  }

  state.refreshUiIdleState()

  return {
    dispose: () => {
      restartBinding.unbind()
      resetBinding.unbind()
      restartBinding.dispose()
      resetBinding.dispose()
      unbindToolsMenu()
      toolsMenuController?.dispose?.()
      statusObserver?.disconnect()
    },
  }
}
