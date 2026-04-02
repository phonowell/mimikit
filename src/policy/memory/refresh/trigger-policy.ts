import type { ManagerRuntime } from '../../../kernel/orchestrator/runtime-interfaces.js'

export const MEMORY_REFRESH_MIN_TURN_GAP = 20

export const hasMemoryRefreshDelta = (runtime: ManagerRuntime): boolean => {
  const state = runtime.process.manager.memoryRefresh
  return state.signalVersion !== state.lastProcessedSignalVersion
}

export const shouldTriggerMemoryRefresh = (runtime: ManagerRuntime): boolean =>
  hasMemoryRefreshDelta(runtime) &&
  runtime.process.manager.turn -
    runtime.process.manager.memoryRefresh.lastCompletedTurn >=
    MEMORY_REFRESH_MIN_TURN_GAP
