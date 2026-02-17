import { replaceAbortController, waitForSignal } from './signal-primitives.js'
import { notifyUiSignal } from './ui-signal.js'

import type { RuntimeState } from './runtime-state.js'

export const notifyWorkerLoop = (runtime: RuntimeState): void => {
  runtime.workerSignalController = replaceAbortController(
    runtime.workerSignalController,
  )
  notifyUiSignal(runtime)
}

export const waitForWorkerLoopSignal = (
  runtime: RuntimeState,
  timeoutMs: number,
): Promise<void> =>
  waitForSignal({
    signal: runtime.workerSignalController.signal,
    timeoutMs,
  })
