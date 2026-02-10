export const createPollingDelayController = (params) => {
  const {
    isPolling,
    isPaused,
    schedule,
    clear,
    isFullyIdle,
    activePollMs,
    idlePollMs,
    retryBaseMs,
    retryMaxMs,
    getConsecutiveFailures,
  } = params

  const scheduleNext = (pollFn) => {
    if (!isPolling() || isPaused()) return
    clear()
    const failures = getConsecutiveFailures()
    const delayMs =
      failures > 0
        ? Math.min(retryMaxMs, retryBaseMs * 2 ** Math.max(0, failures - 1))
        : isFullyIdle()
          ? idlePollMs
          : activePollMs
    schedule(pollFn, delayMs)
  }

  return {
    scheduleNext,
    clear,
  }
}
