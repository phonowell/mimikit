import type { RuntimeMemoryRefreshState } from '../../orchestrator/core/runtime-state.js'
import type { RuntimeSnapshot } from '../../storage/runtime-snapshot-schema.js'

const toIsoOrUndefined = (value: string | undefined): string | undefined => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export const createDefaultMemoryRefreshState =
  (): RuntimeMemoryRefreshState => ({
    lastCompletedTurn: 0,
    lastProcessedInputsCursor: 0,
    lastProcessedResultsCursor: 0,
    running: false,
    pending: false,
  })

export const hydrateMemoryRefreshState = (
  snapshot: RuntimeSnapshot,
): RuntimeMemoryRefreshState => {
  const current = snapshot.memoryRefresh
  if (!current) return createDefaultMemoryRefreshState()
  const lastProcessedPlanUpdatedAt = toIsoOrUndefined(
    current.lastProcessedPlanUpdatedAt,
  )
  const lastRunAt = toIsoOrUndefined(current.lastRunAt)
  return {
    lastCompletedTurn: current.lastCompletedTurn,
    lastProcessedInputsCursor: current.lastProcessedInputsCursor,
    lastProcessedResultsCursor: current.lastProcessedResultsCursor,
    ...(lastProcessedPlanUpdatedAt ? { lastProcessedPlanUpdatedAt } : {}),
    ...(lastRunAt ? { lastRunAt } : {}),
    running: false,
    pending: false,
  }
}

export const toPersistedMemoryRefreshState = (
  state: RuntimeMemoryRefreshState,
): NonNullable<RuntimeSnapshot['memoryRefresh']> => ({
  ...(toIsoOrUndefined(state.lastProcessedPlanUpdatedAt)
    ? { lastProcessedPlanUpdatedAt: toIsoOrUndefined(state.lastProcessedPlanUpdatedAt) }
    : {}),
  ...(toIsoOrUndefined(state.lastRunAt)
    ? { lastRunAt: toIsoOrUndefined(state.lastRunAt) }
    : {}),
  lastCompletedTurn: state.lastCompletedTurn,
  lastProcessedInputsCursor: state.lastProcessedInputsCursor,
  lastProcessedResultsCursor: state.lastProcessedResultsCursor,
})
