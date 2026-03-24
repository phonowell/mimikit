import type { RuntimeState } from '../../../kernel/orchestrator/runtime-state.js'

export const MEMORY_REFRESH_MIN_TURN_GAP = 20

export const hasMemoryRefreshDelta = (runtime: RuntimeState): boolean => {
  const state = runtime.manager.memoryRefresh
  return state.signalVersion !== state.lastProcessedSignalVersion
}

export const shouldTriggerMemoryRefresh = (runtime: RuntimeState): boolean =>
  hasMemoryRefreshDelta(runtime) &&
  runtime.manager.turn - runtime.manager.memoryRefresh.lastCompletedTurn >=
    MEMORY_REFRESH_MIN_TURN_GAP
