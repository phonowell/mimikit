import { appendLog } from '../../../persistence/log/append.js'
import { bestEffort } from '../../../persistence/log/safe.js'

import { MEMORY_REFRESH_JOB, runMemoryRefreshOnce } from './singleflight-run.js'
import { shouldTriggerMemoryRefresh } from './trigger-policy.js'

import type { ManagerRuntime } from '../../../kernel/orchestrator/runtime-interfaces.js'

const runMemoryRefreshDrain = async (
  runtime: ManagerRuntime,
): Promise<void> => {
  const state = runtime.manager.memoryRefresh
  try {
    while (state.pending || shouldTriggerMemoryRefresh(runtime)) {
      state.pending = false
      await runMemoryRefreshOnce(runtime)
    }
  } catch (error) {
    await bestEffort('appendLog: memory_refresh_failed', () =>
      appendLog(runtime.paths.log, {
        event: MEMORY_REFRESH_JOB.auditEvents.failed,
        managerTurn: runtime.manager.turn,
        source: MEMORY_REFRESH_JOB.source,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  } finally {
    state.running = false
    if (state.pending) {
      requestMemoryRefresh(runtime)
      return
    }
    state.pending = false
  }
}

export const requestMemoryRefresh = (runtime: ManagerRuntime): void => {
  const state = runtime.manager.memoryRefresh
  if (state.running) {
    state.pending = true
    return
  }
  if (!state.pending && !shouldTriggerMemoryRefresh(runtime)) return
  state.running = true
  state.pending = false
  void runMemoryRefreshDrain(runtime)
}
