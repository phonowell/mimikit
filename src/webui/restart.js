import { createDialogController } from './dialog.js'
import { setStatusState, setStatusText } from './status.js'

export function bindRestart({
  restartBtn,
  restartDialog,
  restartCancelBtn,
  restartConfirmBtn,
  restartResetBtn,
  statusText,
  statusDot,
  messages,
}) {
  if (!restartBtn) return
  const dialogEnabled = Boolean(
    restartDialog &&
      restartCancelBtn &&
      restartConfirmBtn &&
      restartResetBtn,
  )
  let isBusy = false

  const dialog = dialogEnabled
    ? createDialogController({
        dialog: restartDialog,
        trigger: restartBtn,
        focusOnOpen: restartCancelBtn,
        onAfterClose: () => {
          if (!isBusy) restartBtn.focus()
        },
      })
    : null

  if (dialogEnabled && dialog) dialog.setExpanded(false)

  const disableActions = (disabled) => {
    if (restartCancelBtn) restartCancelBtn.disabled = disabled
    if (restartConfirmBtn) restartConfirmBtn.disabled = disabled
    if (restartResetBtn) restartResetBtn.disabled = disabled
  }

  const waitForServer = (onReady) => {
    setTimeout(async () => {
      try {
        const res = await fetch('/api/status')
        if (res.ok) {
          if (typeof onReady === 'function') {
            onReady()
            return
          }
          restartBtn.disabled = false
          disableActions(false)
          isBusy = false
          if (messages) {
            messages.clearStatusEtag?.()
            messages.start()
          }
          return
        }
      } catch (error) {
        console.warn('[webui] status check failed', error)
      }
      waitForServer(onReady)
    }, 1000)
  }

  const restoreAfterRequestFailure = (mode) => {
    restartBtn.disabled = false
    disableActions(false)
    isBusy = false
    setStatusText(statusText, `${mode} failed`)
    setStatusState(statusDot, 'disconnected')
    if (messages) messages.start()
  }

  const requestRestart = async (mode) => {
    if (isBusy) return
    isBusy = true
    restartBtn.disabled = true
    disableActions(true)
    const label = mode === 'reset' ? 'resetting...' : 'restarting...'
    setStatusText(statusText, label)
    setStatusState(statusDot, '')
    if (messages) messages.stop()
    if (dialog) dialog.close()
    try {
      const response = await fetch(mode === 'reset' ? '/api/reset' : '/api/restart', {
        method: 'POST',
      })
      if (!response.ok) {
        throw new Error(`restart request failed: ${response.status}`)
      }
    } catch (error) {
      console.warn('[webui] restart request failed', error)
      restoreAfterRequestFailure(mode)
      return
    }
    if (mode === 'reset') {
      waitForServer(() => {
        window.location.reload()
      })
      return
    }
    waitForServer()
  }

  const onOpen = (event) => {
    event.preventDefault()
    if (isBusy) return
    if (dialogEnabled && dialog) dialog.open()
    else void requestRestart('restart')
  }
  const onCancel = (event) => {
    event.preventDefault()
    if (isBusy) return
    if (dialog) dialog.close()
  }
  const onRestart = (event) => {
    event.preventDefault()
    if (isBusy) return
    void requestRestart('restart')
  }
  const onReset = (event) => {
    event.preventDefault()
    if (isBusy) return
    void requestRestart('reset')
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
    restartBtn.addEventListener('click', onOpen)
    restartCancelBtn.addEventListener('click', onCancel)
    restartConfirmBtn.addEventListener('click', onRestart)
    restartResetBtn.addEventListener('click', onReset)
    restartDialog.addEventListener('click', onDialogClick)
    restartDialog.addEventListener('cancel', onDialogCancel)
    restartDialog.addEventListener('close', onDialogClose)
  } else {
    restartBtn.addEventListener('click', onOpen)
  }
}
