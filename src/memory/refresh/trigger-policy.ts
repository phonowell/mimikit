import type { RuntimeState } from '../../orchestrator/core/runtime-state.js'

export const MEMORY_REFRESH_MIN_TURN_GAP = 20

export const resolveLatestPlanUpdatedAt = (
  runtime: RuntimeState,
): string | undefined => {
  let latest: string | undefined
  for (const plan of runtime.taskPlans)
    if (!latest || plan.updatedAt > latest) latest = plan.updatedAt

  return latest
}

export const hasMemoryRefreshDelta = (runtime: RuntimeState): boolean => {
  const state = runtime.memoryRefresh
  if (runtime.queues.inputsCursor !== state.lastProcessedInputsCursor)
    return true
  if (runtime.queues.resultsCursor !== state.lastProcessedResultsCursor)
    return true
  const latestPlanUpdatedAt = resolveLatestPlanUpdatedAt(runtime)
  return latestPlanUpdatedAt !== state.lastProcessedPlanUpdatedAt
}

export const shouldTriggerMemoryRefresh = (runtime: RuntimeState): boolean =>
  runtime.managerTurn - runtime.memoryRefresh.lastCompletedTurn >=
  MEMORY_REFRESH_MIN_TURN_GAP
