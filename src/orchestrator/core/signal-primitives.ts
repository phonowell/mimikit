const MAX_WAIT_MS = 24 * 60 * 60 * 1_000

export const abortController = (controller: AbortController): void => {
  if (!controller.signal.aborted) controller.abort()
}

export const replaceOrCreateAbortController = (
  controller?: AbortController,
): AbortController =>
  controller
    ? (abortController(controller), new AbortController())
    : new AbortController()

export const waitForSignal = async (params: {
  signal: AbortSignal
  timeoutMs: number
  isResolved?: () => boolean
}): Promise<void> => {
  const { signal, isResolved } = params
  if (signal.aborted || isResolved?.()) return
  const waitMs = Number.isFinite(params.timeoutMs)
    ? Math.min(MAX_WAIT_MS, Math.max(0, params.timeoutMs))
    : MAX_WAIT_MS
  if (waitMs <= 0) return
  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, waitMs)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted || isResolved?.()) finish()
  })
}
