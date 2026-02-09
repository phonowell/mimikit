import type { RuntimeState } from './runtime-state.js'

const MAX_WAIT_MS = 24 * 60 * 60 * 1_000

const clampWaitMs = (timeoutMs: number): number => {
  if (!Number.isFinite(timeoutMs)) return MAX_WAIT_MS
  return Math.min(MAX_WAIT_MS, Math.max(0, timeoutMs))
}

export const notifyWorkerLoop = (runtime: RuntimeState): void => {
  const previous = runtime.workerSignalController
  runtime.workerSignalController = new AbortController()
  if (!previous.signal.aborted) previous.abort()
}

export const waitForWorkerLoopSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => {
  const { signal } = runtime.workerSignalController
  if (signal.aborted) return
  const waitMs = clampWaitMs(timeoutMs)
  if (waitMs <= 0) return
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, waitMs)
    signal.addEventListener('abort', done, { once: true })
  })
}
