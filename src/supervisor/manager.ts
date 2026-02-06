import { sleep } from '../shared/utils.js'

import {
  createManagerBuffer,
  syncManagerPendingInputs,
} from './manager-buffer.js'
import { runManagerBuffer } from './manager-runner.js'

import type { RuntimeState } from './runtime.js'

export const managerLoop = async (runtime: RuntimeState): Promise<void> => {
  const buffer = createManagerBuffer()
  while (!runtime.stopped) {
    const now = Date.now()
    if (runtime.pendingInputs.length > 0) {
      const drained = runtime.pendingInputs.splice(0)
      buffer.inputs.push(...drained)
      buffer.lastInputAt = now
      syncManagerPendingInputs(runtime, buffer)
    }
    if (runtime.pendingResults.length > 0) {
      const drained = runtime.pendingResults.splice(0)
      buffer.results.push(...drained)
      if (buffer.firstResultAt === 0) buffer.firstResultAt = now
    }
    const hasInputs = buffer.inputs.length > 0
    const hasResults = buffer.results.length > 0
    const debounceReady =
      hasInputs && now - buffer.lastInputAt >= runtime.config.manager.debounceMs
    const resultsReady =
      hasResults &&
      !hasInputs &&
      now - buffer.firstResultAt >= runtime.config.manager.maxResultWaitMs
    if ((debounceReady || resultsReady) && (hasInputs || hasResults))
      await runManagerBuffer(runtime, buffer)
    await sleep(runtime.config.manager.pollMs)
  }
}
