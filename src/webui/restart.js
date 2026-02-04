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
  let isOpen = false
  let isBusy = false

  const setExpanded = (nextOpen) => {
    restartBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false')
  }

  const disableActions = (disabled) => {
    if (restartCancelBtn) restartCancelBtn.disabled = disabled
    if (restartConfirmBtn) restartConfirmBtn.disabled = disabled
    if (restartResetBtn) restartResetBtn.disabled = disabled
  }

  const openDialog = () => {
    if (!restartDialog || isOpen) return
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
    if (typeof restartDialog.close === 'function') {
      restartDialog.close()
    } else {
      restartDialog.removeAttribute('open')
    }
    isOpen = false
    setExpanded(false)
    if (!isBusy) restartBtn.focus()
  }

  const waitForServer = () => {
    setTimeout(async () => {
      try {
        const res = await fetch('/api/status')
        if (res.ok) {
          restartBtn.disabled = false
          disableActions(false)
          isBusy = false
          if (messages) messages.start()
          return
        }
      } catch (error) {
        console.warn('[webui] status check failed', error)
      }
      waitForServer()
    }, 1000)
  }

  const requestRestart = async (mode) => {
    if (isBusy) return
    isBusy = true
    restartBtn.disabled = true
    disableActions(true)
    if (statusText) {
      statusText.textContent = mode === 'reset' ? 'resetting...' : 'restarting...'
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
    isOpen = false
    setExpanded(false)
    if (!isBusy) restartBtn.focus()
  }

  if (dialogEnabled) {
    setExpanded(isOpen)
    restartBtn.addEventListener('click', onOpen)
    restartCancelBtn.addEventListener('click', onCancel)
    restartConfirmBtn.addEventListener('click', onRestart)
    restartResetBtn.addEventListener('click', onReset)
    restartDialog.addEventListener('click', onDialogClick)
    restartDialog.addEventListener('close', onDialogClose)
  } else {
    restartBtn.addEventListener('click', onOpen)
  }
}
