import { bindDialogControls, createDialogController } from './dialog.js'
import { delay, fetchWithTimeout } from './fetch-with-timeout.js'
import { setStatusState, setStatusText } from './status.js'
import { isRecord } from './value.js'

const RESTART_REQUEST_TIMEOUT_MS = 12000
const STATUS_POLL_TIMEOUT_MS = 60000
const STATUS_POLL_INTERVAL_MS = 300
const STATUS_REQUEST_OPTIONS = { cache: 'no-store' }

const readRuntimeIdFromStatus = (raw) => {
  if (!isRecord(raw)) return ''
  const runtimeId = raw.runtimeId
  if (typeof runtimeId !== 'string') return ''
  const trimmed = runtimeId.trim()
  return trimmed.length > 0 ? trimmed : ''
}

const fetchStatusRuntimeId = async () => {
  const response = await fetchWithTimeout(
    '/api/status',
    STATUS_REQUEST_OPTIONS,
    RESTART_REQUEST_TIMEOUT_MS,
  )
  if (!response.ok) return ''
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  return readRuntimeIdFromStatus(payload)
}

export function bindRestart({
  restartBtn,
  toolsToggleBtn,
  toolsMenu,
  toolsRestartBtn,
  toolsResetBtn,
  restartDialog,
  restartCancelBtn,
  restartConfirmBtn,
  restartResetBtn,
  statusText,
  statusDot,
  messages,
}) {
  const toolsEnabled = Boolean(
    toolsToggleBtn &&
      toolsMenu &&
      toolsRestartBtn &&
      toolsResetBtn,
  )
  const fallbackEnabled = Boolean(restartBtn)
  if (!toolsEnabled && !fallbackEnabled) return

  const dialogOpenBtn = toolsEnabled ? toolsRestartBtn : restartBtn
  const focusRestoreBtn = toolsEnabled ? toolsToggleBtn : dialogOpenBtn
  const dialogEnabled = Boolean(
    restartDialog &&
      dialogOpenBtn &&
      restartCancelBtn &&
      restartConfirmBtn &&
      restartResetBtn,
  )
  let isBusy = false
  let isToolsMenuOpen = false

  const setToolsMenuOpen = (open) => {
    if (!toolsEnabled || !toolsToggleBtn || !toolsMenu) return
    isToolsMenuOpen = open
    toolsToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
    toolsMenu.hidden = !open
  }

  const closeToolsMenu = ({ focusTrigger = false } = {}) => {
    if (!toolsEnabled || !toolsToggleBtn || !isToolsMenuOpen) return
    setToolsMenuOpen(false)
    if (focusTrigger && !isBusy) toolsToggleBtn.focus()
  }

  if (toolsEnabled) setToolsMenuOpen(false)

  const dialog = dialogEnabled
    ? createDialogController({
        dialog: restartDialog,
        trigger: dialogOpenBtn,
        focusOnOpen: restartCancelBtn,
        onAfterClose: () => {
          if (!isBusy && focusRestoreBtn) focusRestoreBtn.focus()
        },
      })
    : null

  if (dialogEnabled && dialog) dialog.setExpanded(false)

  const disableActions = (disabled) => {
    if (restartBtn) restartBtn.disabled = disabled
    if (toolsToggleBtn) toolsToggleBtn.disabled = disabled
    if (toolsRestartBtn) toolsRestartBtn.disabled = disabled
    if (toolsResetBtn) toolsResetBtn.disabled = disabled
    if (restartCancelBtn) restartCancelBtn.disabled = disabled
    if (restartConfirmBtn) restartConfirmBtn.disabled = disabled
    if (restartResetBtn) restartResetBtn.disabled = disabled
  }

  const waitForServer = async ({ onReady, previousRuntimeId }) => {
    const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS
    const previousId =
      typeof previousRuntimeId === 'string' ? previousRuntimeId.trim() : ''
    if (!previousId) return false

    while (Date.now() < deadline) {
      try {
        const res = await fetchWithTimeout(
          '/api/status',
          STATUS_REQUEST_OPTIONS,
          RESTART_REQUEST_TIMEOUT_MS,
        )
        if (!res.ok) {
          await delay(STATUS_POLL_INTERVAL_MS)
          continue
        }

        let payload = null
        try {
          payload = await res.json()
        } catch {
          payload = null
        }

        const runtimeId = readRuntimeIdFromStatus(payload)
        const runtimeChanged = runtimeId.length > 0 && runtimeId !== previousId

        if (runtimeChanged) {
          if (typeof onReady === 'function') onReady()
          else {
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
    disableActions(false)
    isBusy = false
    setStatusText(statusText, `${mode} failed`)
    setStatusState(statusDot, 'disconnected')
    if (messages) messages.start()
  }

  const requestRestart = async (mode) => {
    if (isBusy) return
    isBusy = true
    closeToolsMenu()
    disableActions(true)
    const label = mode === 'reset' ? 'resetting' : 'restarting'
    setStatusText(statusText, label)
    setStatusState(statusDot, '')
    if (messages) messages.stop()
    if (dialog) dialog.close()

    let previousRuntimeId = ''
    try {
      previousRuntimeId = await fetchStatusRuntimeId()
    } catch {
      previousRuntimeId = ''
    }
    if (!previousRuntimeId) {
      restoreAfterRequestFailure(mode)
      return
    }

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

    const recovered = await waitForServer({
      previousRuntimeId,
      onReady: () => {
        window.location.reload()
      },
    })
    if (!recovered) restoreAfterRequestFailure(mode)
  }

  const onOpen = (event) => {
    event.preventDefault()
    if (isBusy) return
    closeToolsMenu()
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
    closeToolsMenu()
    void requestRestart('reset')
  }
  const onToolsToggle = (event) => {
    event.preventDefault()
    if (!toolsEnabled || isBusy) return
    if (isToolsMenuOpen) closeToolsMenu()
    else setToolsMenuOpen(true)
  }
  const onDocumentClick = (event) => {
    if (!toolsEnabled || !toolsToggleBtn || !toolsMenu || !isToolsMenuOpen) return
    const target = event.target
    if (!(target instanceof Node)) return
    if (toolsToggleBtn.contains(target) || toolsMenu.contains(target)) return
    closeToolsMenu()
  }
  const onDocumentKeydown = (event) => {
    if (event.key !== 'Escape') return
    closeToolsMenu({ focusTrigger: true })
  }
  let unbindDialogControls = () => {}
  let unbindOpenControl = () => {}

  if (toolsEnabled && toolsToggleBtn && toolsResetBtn) {
    toolsToggleBtn.addEventListener('click', onToolsToggle)
    toolsResetBtn.addEventListener('click', onReset)
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onDocumentKeydown)
  }

  if (dialogEnabled && dialog && dialogOpenBtn) {
    unbindDialogControls = bindDialogControls({
      dialog: restartDialog,
      openBtn: dialogOpenBtn,
      closeBtn: restartCancelBtn,
      controller: dialog,
      onOpen,
      onClose: onCancel,
    })
    restartConfirmBtn.addEventListener('click', onRestart)
    restartResetBtn.addEventListener('click', onReset)
  } else if (toolsEnabled && toolsRestartBtn) {
    toolsRestartBtn.addEventListener('click', onRestart)
    unbindOpenControl = () => {
      toolsRestartBtn.removeEventListener('click', onRestart)
    }
  } else if (restartBtn) {
    restartBtn.addEventListener('click', onOpen)
    unbindOpenControl = () => {
      restartBtn.removeEventListener('click', onOpen)
    }
  }

  return {
    dispose: () => {
      unbindOpenControl()
      unbindDialogControls()
      if (toolsEnabled && toolsToggleBtn && toolsResetBtn) {
        toolsToggleBtn.removeEventListener('click', onToolsToggle)
        toolsResetBtn.removeEventListener('click', onReset)
        document.removeEventListener('click', onDocumentClick)
        document.removeEventListener('keydown', onDocumentKeydown)
      }
      if (restartConfirmBtn) restartConfirmBtn.removeEventListener('click', onRestart)
      if (restartResetBtn) restartResetBtn.removeEventListener('click', onReset)
    },
  }
}
