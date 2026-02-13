import type { RuntimeState } from './runtime-state.js'

const MAX_WAIT_MS = 24 * 60 * 60 * 1_000

const clampWaitMs = (timeoutMs: number): number => {
  if (!Number.isFinite(timeoutMs)) return MAX_WAIT_MS
  return Math.min(MAX_WAIT_MS, Math.max(0, timeoutMs))
}

export const notifyUiSignal = (runtime: RuntimeState): void => {
  const previous = runtime.uiSignalController
  runtime.uiSignalController = new AbortController()
  if (previous && !previous.signal.aborted) previous.abort()
}

export const waitForUiSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => {
  runtime.uiSignalController ??= new AbortController()
  const { signal } = runtime.uiSignalController
  if (signal.aborted) return
  const waitMs = clampWaitMs(timeoutMs)
  if (waitMs <= 0) return
  await new Promise<void>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const onTimeout = () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const timer = setTimeout(onTimeout, waitMs)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
