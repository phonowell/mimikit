export const createPollingDelayController = (params) => {
  const {
    isPolling,
    isHidden,
    schedule,
    clear,
    isFullyIdle,
    activePollMs,
    idlePollMs,
    hiddenPollMs,
    retryBaseMs,
    retryMaxMs,
    getConsecutiveFailures,
  } = params

  const scheduleNext = (pollFn) => {
    if (!isPolling()) return
    clear()
    if (isHidden()) {
      schedule(pollFn, hiddenPollMs)
      return
    }
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
