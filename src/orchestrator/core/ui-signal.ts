import { replaceAbortController, waitForSignal } from './signal-primitives.js'

import type { RuntimeState } from './runtime-state.js'

export const notifyUiSignal = (runtime: RuntimeState): void => {
  const previous = runtime.uiSignalController
  runtime.uiSignalController = previous
    ? replaceAbortController(previous)
    : new AbortController()
}

export const waitForUiSignal = async (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> => {
  runtime.uiSignalController ??= new AbortController()
  await waitForSignal({
    signal: runtime.uiSignalController.signal,
    timeoutMs,
  })
}
