import { notifyUiSignal } from './ui-signal.js'

import type { RuntimeState } from './runtime-state.js'

const MAX_WAIT_MS = 24 * 60 * 60 * 1_000

const clampWaitMs = (timeoutMs: number): number => {
  if (!Number.isFinite(timeoutMs)) return MAX_WAIT_MS
  return Math.min(MAX_WAIT_MS, Math.max(0, timeoutMs))
}

export const notifyManagerLoop = (runtime: RuntimeState): void => {
  const previous = runtime.managerSignalController
  runtime.managerSignalController = new AbortController()
  if (!previous.signal.aborted) previous.abort()
  notifyUiSignal(runtime)
}

export const waitForManagerLoopSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => {
  const { signal } = runtime.managerSignalController
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
