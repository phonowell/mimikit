export const createMessagesLifecycle = (params) => {
  const { runtime, scroll, poll, clearDelay, scheduleNextPoll } = params

  const start = () => {
    if (runtime.isPolling) return
    scroll.bindScrollControls()
    runtime.isPolling = true
    runtime.isPageHidden = typeof document !== 'undefined' && document.hidden === true
    poll()
  }

  const stop = () => {
    runtime.isPolling = false
    runtime.isPageHidden = false
    clearDelay()
  }

  const onVisibilityChange = () => {
    if (!runtime.isPolling) return
    const hidden = typeof document !== 'undefined' && document.hidden === true
    const wasHidden = runtime.isPageHidden === true
    runtime.isPageHidden = hidden
    if (hidden) {
      clearDelay()
      scheduleNextPoll()
      return
    }
    if (!wasHidden) return
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
