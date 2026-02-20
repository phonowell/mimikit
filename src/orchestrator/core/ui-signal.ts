import {
  replaceOrCreateAbortController,
  waitForSignal,
} from './signal-primitives.js'

import type { RuntimeState } from './runtime-state.js'

export const notifyUiSignal = (runtime: RuntimeState): void => {
  runtime.uiSignalController = replaceOrCreateAbortController(
    runtime.uiSignalController,
  )
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
