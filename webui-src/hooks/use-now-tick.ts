import { useRef, useSyncExternalStore } from 'react'

type Listener = () => void

export type NowTickStore = {
  getSnapshot: () => number
  subscribe: (listener: Listener) => () => void
}

export const createNowTickStore = (intervalMs: number): NowTickStore => {
  const listeners = new Set<Listener>()
  let timer: ReturnType<typeof globalThis.setInterval> | null = null
  let snapshot = Date.now()

  const refreshSnapshot = (): boolean => {
    const next = Date.now()
    if (next === snapshot) return false
    snapshot = next
    return true
  }

  const emit = () => {
    refreshSnapshot()
    const queue = [...listeners]
    for (const listener of queue) listener()
  }

  const ensureTimer = () => {
    if (timer !== null || listeners.size === 0) return
    timer = globalThis.setInterval(emit, intervalMs)
  }

  const clearTimerIfIdle = () => {
    if (timer === null || listeners.size > 0) return
    globalThis.clearInterval(timer)
    timer = null
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      if (refreshSnapshot()) queueMicrotask(listener)
      ensureTimer()
      return () => {
        listeners.delete(listener)
        clearTimerIfIdle()
      }
    },
  }
}

const sharedStores = new Map<number, NowTickStore>()

const getSharedNowTickStore = (intervalMs: number): NowTickStore => {
  const existing = sharedStores.get(intervalMs)
  if (existing) return existing
  const created = createNowTickStore(intervalMs)
  sharedStores.set(intervalMs, created)
  return created
}

export const useNowTick = (intervalMs: number, enabled = true): number => {
  const disabledSnapshotRef = useRef(Date.now())
  if (!enabled) disabledSnapshotRef.current = Date.now()

  const store = getSharedNowTickStore(intervalMs)
  const getDisabledSnapshot = () => disabledSnapshotRef.current
  return useSyncExternalStore(
    enabled ? store.subscribe : () => () => {},
    enabled ? store.getSnapshot : getDisabledSnapshot,
    enabled ? store.getSnapshot : getDisabledSnapshot,
  )
}
