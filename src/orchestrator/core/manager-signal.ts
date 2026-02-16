import { notifyUiSignal } from './ui-signal.js'

import type { RuntimeState } from './runtime-state.js'

const MAX_WAIT_MS = 24 * 60 * 60 * 1_000

const clampWaitMs = (timeoutMs: number): number => {
  if (!Number.isFinite(timeoutMs)) return MAX_WAIT_MS
  return Math.min(MAX_WAIT_MS, Math.max(0, timeoutMs))
}

export const notifyManagerLoop = (runtime: RuntimeState): void => {
  runtime.managerWakePending = true
  if (!runtime.managerSignalController.signal.aborted)
    runtime.managerSignalController.abort()
  notifyUiSignal(runtime)
}

export const waitForManagerLoopSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => {
  if (runtime.managerWakePending) {
    runtime.managerWakePending = false
    return
  }
  const waitMs = clampWaitMs(timeoutMs)
  if (waitMs <= 0) return
  const controller = new AbortController()
  runtime.managerSignalController = controller
  const { signal } = controller
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, waitMs)
    signal.addEventListener('abort', done, { once: true })
    if (signal.aborted || runtime.managerWakePending) done()
  })
  runtime.managerWakePending = false
}
