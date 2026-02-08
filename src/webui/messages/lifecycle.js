export const createMessagesLifecycle = (params) => {
  const { runtime, scroll, notifications, poll, clearDelay } = params

  const start = () => {
    if (runtime.isPolling) return
    scroll.bindScrollControls()
    runtime.unbindNotificationPrompt = notifications.bindPermissionPrompt()
    runtime.isPolling = true
    const hidden = typeof document !== 'undefined' && document.hidden === true
    runtime.pausedByVisibility = hidden
    if (hidden) return
    poll()
  }

  const stop = () => {
    runtime.isPolling = false
    runtime.pausedByVisibility = false
    runtime.unbindNotificationPrompt()
    runtime.unbindNotificationPrompt = () => {}
    clearDelay()
  }

  const onVisibilityChange = () => {
    if (!runtime.isPolling) return
    const hidden = typeof document !== 'undefined' && document.hidden === true
    if (hidden) {
      runtime.pausedByVisibility = true
      clearDelay()
      return
    }
    const wasPaused = runtime.pausedByVisibility
    runtime.pausedByVisibility = false
    if (!wasPaused) return
    clearDelay()
    poll()
  }

  const bindVisibility = () => {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  return { start, stop, bindVisibility }
}

export const runPollLoop = async (params) => {
  const {
    runtime,
    pollOnce,
    delay,
    onDisconnected,
    consecutiveFailures,
    setConsecutiveFailures,
    poll,
  } = params
  if (!runtime.isPolling) return
  try {
    await pollOnce()
    setConsecutiveFailures(0)
  } catch (error) {
    setConsecutiveFailures(consecutiveFailures + 1)
    console.warn('[webui] poll failed', error)
    onDisconnected()
  }
  delay.scheduleNext(poll)
}
