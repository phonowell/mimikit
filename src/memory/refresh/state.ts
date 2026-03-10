import type { RuntimeSnapshot } from '../../storage/runtime-snapshot-schema.js'

export type RuntimeMemoryRefreshState = {
  lastCompletedTurn: number
  lastProcessedInputsCursor: number
  lastProcessedResultsCursor: number
  lastProcessedPlanUpdatedAt?: string
  lastRunAt?: string
  running: boolean
  pending: boolean
}

const toIsoOrUndefined = (value: string | undefined): string | undefined => {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

const toOptionalIsoState = (params: {
  lastProcessedPlanUpdatedAt: string | undefined
  lastRunAt: string | undefined
}): {
  lastProcessedPlanUpdatedAt?: string
  lastRunAt?: string
} => {
  const lastProcessedPlanUpdatedAt = toIsoOrUndefined(
    params.lastProcessedPlanUpdatedAt,
  )
  const lastRunAt = toIsoOrUndefined(params.lastRunAt)
  return {
    ...(lastProcessedPlanUpdatedAt ? { lastProcessedPlanUpdatedAt } : {}),
    ...(lastRunAt ? { lastRunAt } : {}),
  }
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
  return {
    lastCompletedTurn: current.lastCompletedTurn,
    lastProcessedInputsCursor: current.lastProcessedInputsCursor,
    lastProcessedResultsCursor: current.lastProcessedResultsCursor,
    ...toOptionalIsoState({
      lastProcessedPlanUpdatedAt: current.lastProcessedPlanUpdatedAt,
      lastRunAt: current.lastRunAt,
    }),
    running: false,
    pending: false,
  }
}

export const toPersistedMemoryRefreshState = (
  state: RuntimeMemoryRefreshState,
): NonNullable<RuntimeSnapshot['memoryRefresh']> => ({
  ...toOptionalIsoState({
    lastProcessedPlanUpdatedAt: state.lastProcessedPlanUpdatedAt,
    lastRunAt: state.lastRunAt,
  }),
  lastCompletedTurn: state.lastCompletedTurn,
  lastProcessedInputsCursor: state.lastProcessedInputsCursor,
  lastProcessedResultsCursor: state.lastProcessedResultsCursor,
})
