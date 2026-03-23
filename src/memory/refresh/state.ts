import type { RuntimeSnapshot } from '../../storage/runtime-snapshot-schema.js'

export type RuntimeMemoryRefreshState = {
  lastCompletedTurn: number
  lastProcessedInputsCursor: number
  lastRunAt?: string
  running: boolean
  pending: boolean
}

const toIsoOrUndefined = (value: string | undefined): string | undefined => {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

const toOptionalIsoState = (params: {
  lastRunAt: string | undefined
}): { lastRunAt?: string } => {
  const lastRunAt = toIsoOrUndefined(params.lastRunAt)
  return lastRunAt ? { lastRunAt } : {}
}

export const createDefaultMemoryRefreshState =
  (): RuntimeMemoryRefreshState => ({
    lastCompletedTurn: 0,
    lastProcessedInputsCursor: 0,
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
    ...toOptionalIsoState({
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
    lastRunAt: state.lastRunAt,
  }),
  lastCompletedTurn: state.lastCompletedTurn,
  lastProcessedInputsCursor: state.lastProcessedInputsCursor,
})
