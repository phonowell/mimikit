import { abortController, waitForSignal } from './signal-primitives.js'
import { notifyUiSignal } from './ui-signal.js'

import type { RuntimeState } from './runtime-state.js'

export const notifyManagerLoop = (runtime: RuntimeState): void => {
  runtime.managerWakePending = true
  abortController(runtime.managerSignalController)
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
  const controller = new AbortController()
  runtime.managerSignalController = controller
  await waitForSignal({
    signal: controller.signal,
    timeoutMs,
    isResolved: () => runtime.managerWakePending,
  })
  runtime.managerWakePending = false
}
