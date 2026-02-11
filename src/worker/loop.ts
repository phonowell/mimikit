import { waitForWorkerLoopSignal } from '../orchestrator/core/worker-signal.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const workerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped)
    await waitForWorkerLoopSignal(runtime, Number.POSITIVE_INFINITY)

  runtime.workerQueue.pause()
  runtime.workerQueue.clear()
}
