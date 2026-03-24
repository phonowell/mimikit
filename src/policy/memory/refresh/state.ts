import type { RuntimeSnapshot } from '../../../persistence/storage/runtime-snapshot-schema.js'

export type RuntimeMemoryRefreshState = {
  lastCompletedTurn: number
  signalVersion: number
  lastProcessedSignalVersion: number
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
    signalVersion: 0,
    lastProcessedSignalVersion: 0,
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
    signalVersion: current.signalVersion,
    lastProcessedSignalVersion: current.lastProcessedSignalVersion,
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
  signalVersion: state.signalVersion,
  lastProcessedSignalVersion: state.lastProcessedSignalVersion,
})
