import { formatStatusText } from './status-text.js'

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
  const closeAnimationMs = 140
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const dialogEnabled = Boolean(
    restartDialog &&
      restartCancelBtn &&
      restartConfirmBtn &&
      restartResetBtn,
  )
  let isOpen = false
  let isBusy = false
  let closeTimer = null
  let closeAnimationHandler = null

  const setExpanded = (nextOpen) => {
    restartBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
  }

  const clearClosingState = () => {
    if (!restartDialog) return
    restartDialog.classList.remove('is-closing')
    if (closeAnimationHandler) {
      restartDialog.removeEventListener('animationend', closeAnimationHandler)
      closeAnimationHandler = null
    }
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = null
    }
  }

  const finalizeClose = () => {
    if (!isOpen) return
    isOpen = false
    setExpanded(false)
    clearClosingState()
    if (!isBusy) restartBtn.focus()
  }

  const performClose = () => {
    if (!restartDialog || !isOpen) return
    if (typeof restartDialog.close === 'function') {
      restartDialog.close()
    } else {
      restartDialog.removeAttribute('open')
      finalizeClose()
    }
  }

  const disableActions = (disabled) => {
    if (restartCancelBtn) restartCancelBtn.disabled = disabled
    if (restartConfirmBtn) restartConfirmBtn.disabled = disabled
    if (restartResetBtn) restartResetBtn.disabled = disabled
  }

  const openDialog = () => {
    if (!restartDialog) return
    if (restartDialog.classList.contains('is-closing')) {
      clearClosingState()
      return
    }
    if (isOpen) return
    if (typeof restartDialog.showModal === 'function') {
      if (!restartDialog.open) restartDialog.showModal()
    } else {
      restartDialog.setAttribute('open', '')
    }
    isOpen = true
    setExpanded(true)
    if (restartCancelBtn) {
      window.requestAnimationFrame(() => {
        restartCancelBtn.focus()
      })
    }
  }

  const closeDialog = () => {
    if (!restartDialog || !isOpen) return
    if (restartDialog.classList.contains('is-closing')) return
    if (prefersReducedMotion) {
      performClose()
      return
    }
    restartDialog.classList.add('is-closing')
    const onAnimationEnd = (event) => {
      if (event.target !== restartDialog) return
      if (closeAnimationHandler) {
        restartDialog.removeEventListener('animationend', closeAnimationHandler)
        closeAnimationHandler = null
      }
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
      performClose()
    }
    closeAnimationHandler = onAnimationEnd
    restartDialog.addEventListener('animationend', onAnimationEnd)
    closeTimer = window.setTimeout(() => {
      if (closeAnimationHandler) {
        restartDialog.removeEventListener('animationend', closeAnimationHandler)
        closeAnimationHandler = null
      }
      performClose()
    }, closeAnimationMs + 40)
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
          if (messages) messages.start()
          return
        }
      } catch (error) {
        console.warn('[webui] status check failed', error)
      }
      waitForServer(onReady)
    }, 1000)
  }

  const requestRestart = async (mode) => {
    if (isBusy) return
    isBusy = true
    restartBtn.disabled = true
    disableActions(true)
    if (statusText) {
      const label = mode === 'reset' ? 'resetting...' : 'restarting...'
      statusText.textContent = formatStatusText(label)
    }
    if (statusDot) statusDot.dataset.state = ''
    if (messages) messages.stop()
    closeDialog()
    try {
      await fetch(mode === 'reset' ? '/api/reset' : '/api/restart', {
        method: 'POST',
      })
    } catch (error) {
      console.warn('[webui] restart request failed', error)
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
    if (dialogEnabled) openDialog()
    else void requestRestart('restart')
  }
  const onCancel = (event) => {
    event.preventDefault()
    if (isBusy) return
    closeDialog()
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
    if (event.target === restartDialog) closeDialog()
  }
  const onDialogClose = () => {
    if (!isOpen) return
    finalizeClose()
  }
  const onDialogCancel = (event) => {
    event.preventDefault()
    closeDialog()
  }

  if (dialogEnabled) {
    setExpanded(isOpen)
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
