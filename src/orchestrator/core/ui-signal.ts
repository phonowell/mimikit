import { abortController, waitForSignal } from './signal-primitives.js'

import type { RuntimeState } from './runtime-state.js'

export const notifyUiSignal = (runtime: RuntimeState): void => {
  runtime.uiWakePending = true
  runtime.uiSignalController ??= new AbortController()
  abortController(runtime.uiSignalController)
}

export const waitForUiSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => {
  if (runtime.uiWakePending) {
    runtime.uiWakePending = false
    return
  }
  const controller = new AbortController()
  runtime.uiSignalController = controller
  await waitForSignal({
    signal: controller.signal,
    timeoutMs,
    isResolved: () => runtime.uiWakePending,
  })
  runtime.uiWakePending = false
}
