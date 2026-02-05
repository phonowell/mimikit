export type IdleAbortHandle = {
  signal: AbortSignal | null
  startedAt: number
  lastActivityAt: () => number
  reset: () => void
  dispose: () => void
}

export const createIdleAbort = (opts: {
  timeoutMs: number
  externalSignal?: AbortSignal
  onAbort?: () => void
}): IdleAbortHandle => {
  const { timeoutMs, externalSignal, onAbort } = opts
  const controller =
    timeoutMs > 0 || externalSignal ? new AbortController() : null
  const startedAt = Date.now()
  let lastActivity = startedAt
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const onExternalAbort = () => {
    if (controller && !controller.signal.aborted) controller.abort()
  }
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort()
    else
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }
  if (controller && onAbort)
    controller.signal.addEventListener('abort', onAbort, { once: true })

  return {
    signal: controller?.signal ?? null,
    startedAt,
    lastActivityAt: () => lastActivity,
    reset() {
      lastActivity = Date.now()
      if (!controller || timeoutMs <= 0) return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), timeoutMs)
    },
    dispose() {
      clearTimeout(idleTimer)
      if (externalSignal)
        externalSignal.removeEventListener('abort', onExternalAbort)
    },
  }
}
