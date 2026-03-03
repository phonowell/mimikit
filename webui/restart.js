import { bindDialogControls, createDialogController } from './dialog.js'
import { delay, fetchWithTimeout } from './fetch-with-timeout.js'
import { setStatusState, setStatusText } from './status.js'
import { isRecord } from './value.js'

const RESTART_REQUEST_TIMEOUT_MS = 12000
const STATUS_POLL_TIMEOUT_MS = 60000
const STATUS_POLL_INTERVAL_MS = 300
const STATUS_REQUEST_OPTIONS = { cache: 'no-store' }
const NON_IDLE_UI_HINT =
  'Restart and reset are available only when manager and workers are idle.'
const NON_IDLE_BLOCK_REASON =
  'system is busy; wait for manager and workers to become idle'

const normalizeTaskCount = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value <= 0) return 0
  return Math.floor(value)
}

const isStatusIdle = (raw) => {
  if (!isRecord(raw)) return false
  const managerRunning = raw.managerRunning
  const activeTasks = normalizeTaskCount(raw.activeTasks)
  const pendingTasks = normalizeTaskCount(raw.pendingTasks)

  if (
    typeof managerRunning === 'boolean' &&
    activeTasks !== null &&
    pendingTasks !== null
  ) 
    return !managerRunning && activeTasks === 0 && pendingTasks === 0
  

  const agentStatus =
    typeof raw.agentStatus === 'string' ? raw.agentStatus.trim().toLowerCase() : ''
  return agentStatus === 'idle'
}

const readRuntimeIdFromStatus = (raw) => {
  if (!isRecord(raw)) return ''
  const runtimeId = raw.runtimeId
  if (typeof runtimeId !== 'string') return ''
  const trimmed = runtimeId.trim()
  return trimmed.length > 0 ? trimmed : ''
}

const readStatusError = (raw) => {
  if (!isRecord(raw)) return ''
  const error = raw.error
  if (typeof error !== 'string') return ''
  const trimmed = error.trim()
  return trimmed.length > 0 ? trimmed : ''
}

const readResponseError = async (response, fallback) => {
  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const detail = readStatusError(payload)
  return detail || fallback
}

const fetchStatusSnapshot = async () => {
  try {
    const response = await fetchWithTimeout(
      '/api/status',
      STATUS_REQUEST_OPTIONS,
      RESTART_REQUEST_TIMEOUT_MS,
    )
    if (!response.ok) {
      return {
        runtimeId: '',
        isIdle: false,
        error: `status request failed (${response.status})`,
      }
    }

    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    return {
      runtimeId: readRuntimeIdFromStatus(payload),
      isIdle: isStatusIdle(payload),
      error: readStatusError(payload),
    }
  } catch {
    return {
      runtimeId: '',
      isIdle: false,
      error: 'status request failed',
    }
  }
}

export function bindRestart({
  restartBtn,
  toolsToggleBtn,
  toolsMenu,
  toolsRestartBtn,
  toolsResetBtn,
  toolsIdleHint,
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
  const toolsEnabled = Boolean(
    toolsToggleBtn && toolsMenu && toolsRestartBtn && toolsResetBtn,
  )
  const fallbackEnabled = Boolean(restartBtn)
  if (!toolsEnabled && !fallbackEnabled) return

  const restartOpenBtn = toolsEnabled ? toolsRestartBtn : restartBtn
  const resetOpenBtn = toolsEnabled ? toolsResetBtn : null

  const restartDialogEnabled = Boolean(
    restartDialog && restartOpenBtn && restartCancelBtn && restartConfirmBtn,
  )
  const resetDialogEnabled = Boolean(
    resetDialog && resetOpenBtn && resetCancelBtn && resetConfirmBtn,
  )

  let isBusy = false
  let isToolsMenuOpen = false
  let isRuntimeIdle = true

  const titleByElement = new Map()
  const rememberDefaultTitle = (element) => {
    if (!element || titleByElement.has(element)) return
    const current = element.getAttribute('title')
    titleByElement.set(element, typeof current === 'string' ? current : '')
  }

  const restoreDefaultTitle = (element) => {
    if (!element) return
    const original = titleByElement.get(element) ?? ''
    if (original) element.setAttribute('title', original)
    else element.removeAttribute('title')
  }

  const setBlockedTitle = (element, blocked) => {
    if (!element) return
    if (blocked) element.setAttribute('title', NON_IDLE_UI_HINT)
    else restoreDefaultTitle(element)
  }

  ;[
    restartBtn,
    toolsToggleBtn,
    toolsRestartBtn,
    toolsResetBtn,
    restartConfirmBtn,
    resetConfirmBtn,
  ].forEach(rememberDefaultTitle)

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

  const focusRestoreBtn = toolsEnabled ? toolsToggleBtn : restartOpenBtn

  const restartDialogController = restartDialogEnabled
    ? createDialogController({
        dialog: restartDialog,
        trigger: restartOpenBtn,
        focusOnOpen: restartCancelBtn,
        onAfterClose: () => {
          if (!isBusy && focusRestoreBtn) focusRestoreBtn.focus()
        },
      })
    : null

  const resetDialogController = resetDialogEnabled
    ? createDialogController({
        dialog: resetDialog,
        trigger: resetOpenBtn,
        focusOnOpen: resetCancelBtn,
        onAfterClose: () => {
          if (!isBusy && focusRestoreBtn) focusRestoreBtn.focus()
        },
      })
    : null

  if (restartDialogController) restartDialogController.setExpanded(false)
  if (resetDialogController) resetDialogController.setExpanded(false)

  const closeAllDialogs = () => {
    if (restartDialogController) restartDialogController.close()
    if (resetDialogController) resetDialogController.close()
  }

  const syncControlState = () => {
    const blockedByIdle = !isRuntimeIdle
    const disableActions = isBusy || blockedByIdle

    if (restartBtn) restartBtn.disabled = disableActions
    if (toolsRestartBtn) toolsRestartBtn.disabled = disableActions
    if (toolsResetBtn) toolsResetBtn.disabled = disableActions
    if (toolsToggleBtn) toolsToggleBtn.disabled = isBusy
    if (restartCancelBtn) restartCancelBtn.disabled = isBusy
    if (restartConfirmBtn) restartConfirmBtn.disabled = disableActions
    if (resetCancelBtn) resetCancelBtn.disabled = isBusy
    if (resetConfirmBtn) resetConfirmBtn.disabled = disableActions

    setBlockedTitle(restartBtn, blockedByIdle)
    setBlockedTitle(toolsRestartBtn, blockedByIdle)
    setBlockedTitle(toolsResetBtn, blockedByIdle)
    setBlockedTitle(restartConfirmBtn, blockedByIdle)
    setBlockedTitle(resetConfirmBtn, blockedByIdle)

    if (toolsIdleHint) toolsIdleHint.hidden = !blockedByIdle

    if (blockedByIdle) {
      closeToolsMenu()
      closeAllDialogs()
    }
  }

  const readUiIdleState = () => {
    if (messages && typeof messages.isFullyIdle === 'function')
      return messages.isFullyIdle()
    const state = statusDot?.dataset?.state?.trim().toLowerCase()
    return state === 'idle'
  }

  const refreshUiIdleState = () => {
    isRuntimeIdle = readUiIdleState()
    syncControlState()
    return isRuntimeIdle
  }

  const restoreAfterRequestFailure = (mode, reason = '') => {
    isBusy = false
    refreshUiIdleState()
    const fallback = mode === 'reset' ? 'reset failed' : 'restart failed'
    setStatusText(statusText, reason || fallback)
    setStatusState(statusDot, 'disconnected')
    if (messages) messages.start()
  }

  const restoreAfterBlockedByBusyState = (mode, reason = '') => {
    isBusy = false
    isRuntimeIdle = false
    syncControlState()
    const label = mode === 'reset' ? 'reset blocked' : 'restart blocked'
    const detail = reason.trim() || NON_IDLE_BLOCK_REASON
    setStatusText(statusText, `${label}: ${detail}`)
    setStatusState(statusDot, 'running')
    if (messages) messages.start()
  }

  const waitForServer = async ({ onReady, previousRuntimeId }) => {
    const deadline = Date.now() + STATUS_POLL_TIMEOUT_MS
    const previousId =
      typeof previousRuntimeId === 'string' ? previousRuntimeId.trim() : ''
    if (!previousId) return false

    while (Date.now() < deadline) {
      try {
        const response = await fetchWithTimeout(
          '/api/status',
          STATUS_REQUEST_OPTIONS,
          RESTART_REQUEST_TIMEOUT_MS,
        )
        if (!response.ok) {
          await delay(STATUS_POLL_INTERVAL_MS)
          continue
        }

        let payload = null
        try {
          payload = await response.json()
        } catch {
          payload = null
        }

        const runtimeId = readRuntimeIdFromStatus(payload)
        const runtimeChanged = runtimeId.length > 0 && runtimeId !== previousId

        if (runtimeChanged) {
          if (typeof onReady === 'function') onReady()
          else {
            isBusy = false
            refreshUiIdleState()
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

  const requestRestart = async (mode) => {
    if (isBusy) return
    if (!refreshUiIdleState()) {
      restoreAfterBlockedByBusyState(mode)
      return
    }

    isBusy = true
    closeToolsMenu()
    syncControlState()

    const label = mode === 'reset' ? 'resetting' : 'restarting'
    setStatusText(statusText, label)
    setStatusState(statusDot, '')
    if (messages) messages.stop()
    closeAllDialogs()

    const preflight = await fetchStatusSnapshot()
    if (!preflight.runtimeId) {
      restoreAfterRequestFailure(mode)
      return
    }
    if (!preflight.isIdle) {
      restoreAfterBlockedByBusyState(mode, preflight.error)
      return
    }

    try {
      const response = await fetchWithTimeout(
        mode === 'reset' ? '/api/reset' : '/api/restart',
        { method: 'POST' },
        RESTART_REQUEST_TIMEOUT_MS,
      )
      if (!response.ok) {
        const fallback = `${mode} failed (${response.status})`
        const detail = await readResponseError(response, fallback)
        if (response.status === 409 || response.status === 423) {
          restoreAfterBlockedByBusyState(mode, detail)
          return
        }
        throw new Error(detail)
      }
    } catch (error) {
      console.warn('[webui] restart request failed', error)
      const reason = error instanceof Error ? error.message : ''
      restoreAfterRequestFailure(mode, reason)
      return
    }

    const recovered = await waitForServer({
      previousRuntimeId: preflight.runtimeId,
      onReady: () => {
        window.location.reload()
      },
    })
    if (!recovered) restoreAfterRequestFailure(mode)
  }

  const onOpenRestart = (event) => {
    event.preventDefault()
    if (isBusy) return
    if (!refreshUiIdleState()) {
      restoreAfterBlockedByBusyState('restart')
      return
    }

    closeToolsMenu()
    if (resetDialogController) resetDialogController.close()
    if (restartDialogController) restartDialogController.open()
    else void requestRestart('restart')
  }

  const onOpenReset = (event) => {
    event.preventDefault()
    if (isBusy) return
    if (!refreshUiIdleState()) {
      restoreAfterBlockedByBusyState('reset')
      return
    }

    closeToolsMenu()
    if (restartDialogController) restartDialogController.close()
    if (resetDialogController) resetDialogController.open()
    else void requestRestart('reset')
  }

  const onCancelRestart = (event) => {
    event.preventDefault()
    if (isBusy || !restartDialogController) return
    restartDialogController.close()
  }

  const onCancelReset = (event) => {
    event.preventDefault()
    if (isBusy || !resetDialogController) return
    resetDialogController.close()
  }

  const onConfirmRestart = (event) => {
    event.preventDefault()
    if (isBusy) return
    void requestRestart('restart')
  }

  const onConfirmReset = (event) => {
    event.preventDefault()
    if (isBusy) return
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

  let unbindRestartDialogControls = () => {}
  let unbindResetDialogControls = () => {}
  let unbindRestartOpenControl = () => {}
  let unbindResetOpenControl = () => {}

  if (toolsEnabled && toolsToggleBtn) {
    toolsToggleBtn.addEventListener('click', onToolsToggle)
    document.addEventListener('click', onDocumentClick)
    document.addEventListener('keydown', onDocumentKeydown)
  }

  if (restartDialogController && restartDialog && restartOpenBtn) {
    unbindRestartDialogControls = bindDialogControls({
      dialog: restartDialog,
      openBtn: restartOpenBtn,
      closeBtn: restartCancelBtn,
      controller: restartDialogController,
      onOpen: onOpenRestart,
      onClose: onCancelRestart,
    })
    if (restartConfirmBtn)
      restartConfirmBtn.addEventListener('click', onConfirmRestart)
  } else if (restartOpenBtn) {
    restartOpenBtn.addEventListener('click', onOpenRestart)
    unbindRestartOpenControl = () => {
      restartOpenBtn.removeEventListener('click', onOpenRestart)
    }
  }

  if (resetDialogController && resetDialog && resetOpenBtn) {
    unbindResetDialogControls = bindDialogControls({
      dialog: resetDialog,
      openBtn: resetOpenBtn,
      closeBtn: resetCancelBtn,
      controller: resetDialogController,
      onOpen: onOpenReset,
      onClose: onCancelReset,
    })
    if (resetConfirmBtn) resetConfirmBtn.addEventListener('click', onConfirmReset)
  } else if (resetOpenBtn) {
    resetOpenBtn.addEventListener('click', onOpenReset)
    unbindResetOpenControl = () => {
      resetOpenBtn.removeEventListener('click', onOpenReset)
    }
  }

  let statusObserver = null
  if (statusDot && typeof MutationObserver === 'function') {
    statusObserver = new MutationObserver(() => {
      refreshUiIdleState()
    })
    statusObserver.observe(statusDot, {
      attributes: true,
      attributeFilter: ['data-state'],
    })
  }

  refreshUiIdleState()

  return {
    dispose: () => {
      unbindRestartOpenControl()
      unbindResetOpenControl()
      unbindRestartDialogControls()
      unbindResetDialogControls()

      if (toolsEnabled && toolsToggleBtn) {
        toolsToggleBtn.removeEventListener('click', onToolsToggle)
        document.removeEventListener('click', onDocumentClick)
        document.removeEventListener('keydown', onDocumentKeydown)
      }

      if (restartConfirmBtn)
        restartConfirmBtn.removeEventListener('click', onConfirmRestart)
      if (resetConfirmBtn) resetConfirmBtn.removeEventListener('click', onConfirmReset)
      if (statusObserver) statusObserver.disconnect()
    },
  }
}
