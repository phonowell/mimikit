import { createDialogController } from './dialog.js'
import { delay, fetchWithTimeout } from './fetch-with-timeout.js'
import { setStatusState, setStatusText } from './status.js'

const RESTART_REQUEST_TIMEOUT_MS = 12000
const STATUS_POLL_TIMEOUT_MS = 60000
const STATUS_POLL_INTERVAL_MS = 1000

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

  const waitForServer = async (onReady) => {
    const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      try {
        const res = await fetchWithTimeout('/api/status', {}, RESTART_REQUEST_TIMEOUT_MS)
        if (res.ok) {
          if (typeof onReady === 'function') onReady()
          else {
            restartBtn.disabled = false
            disableActions(false)
            isBusy = false
            if (messages) messages.start()
          }
          return true
        }
      } catch (error) {
        console.warn('[webui] status check failed', error)
      }
      await delay(STATUS_POLL_INTERVAL_MS)
    }
    return false
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
    const label = mode === 'reset' ? 'resetting' : 'restarting'
    setStatusText(statusText, label)
    setStatusState(statusDot, '')
    if (messages) messages.stop()
    if (dialog) dialog.close()
    try {
      const response = await fetchWithTimeout(
        mode === 'reset' ? '/api/reset' : '/api/restart',
        { method: 'POST' },
        RESTART_REQUEST_TIMEOUT_MS,
      )
      if (!response.ok) 
        throw new Error(`restart request failed: ${response.status}`)
      
    } catch (error) {
      console.warn('[webui] restart request failed', error)
      restoreAfterRequestFailure(mode)
      return
    }
    const recovered = await waitForServer(() => {
      window.location.reload()
    })
    if (!recovered) restoreAfterRequestFailure(mode)
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
  } else 
    restartBtn.addEventListener('click', onOpen)
  
}
