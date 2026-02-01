import { CommandLane } from './lanes.js'

type QueueEntry = {
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  enqueuedAt: number
  warnAfterMs: number
  onWait?: (waitMs: number, queuedAhead: number) => void
}

type LaneState = {
  lane: string
  queue: QueueEntry[]
  active: number
  maxConcurrent: number
  draining: boolean
}

const lanes = new Map<string, LaneState>()

const getLaneState = (lane: string): LaneState => {
  const existing = lanes.get(lane)
  if (existing) return existing
  const created: LaneState = {
    lane,
    queue: [],
    active: 0,
    maxConcurrent: 1,
    draining: false,
  }
  lanes.set(lane, created)
  return created
}

const drainLane = (lane: string) => {
  const state = getLaneState(lane)
  if (state.draining) return
  state.draining = true

  const pump = () => {
    while (state.active < state.maxConcurrent && state.queue.length > 0) {
      const entry = state.queue.shift() as QueueEntry
      const waitedMs = Date.now() - entry.enqueuedAt
      if (waitedMs >= entry.warnAfterMs)
        entry.onWait?.(waitedMs, state.queue.length)

      state.active += 1
      void (async () => {
        try {
          const result = await entry.task()
          state.active -= 1
          pump()
          entry.resolve(result)
        } catch (err) {
          state.active -= 1
          pump()
          entry.reject(err)
        }
      })()
    }
    state.draining = false
  }

  pump()
}

export const setCommandLaneConcurrency = (
  lane: string,
  maxConcurrent: number,
) => {
  const cleaned = lane.trim() || CommandLane.Internal
  const state = getLaneState(cleaned)
  state.maxConcurrent = Math.max(1, Math.floor(maxConcurrent))
  drainLane(cleaned)
}

export const enqueueCommandInLane = <T>(
  lane: string,
  task: () => Promise<T>,
  opts?: {
    warnAfterMs?: number
    onWait?: (waitMs: number, queuedAhead: number) => void
  },
): Promise<T> => {
  const cleaned = lane.trim() || CommandLane.Internal
  const warnAfterMs = opts?.warnAfterMs ?? 2_000
  const state = getLaneState(cleaned)
  return new Promise<T>((resolve, reject) => {
    const entry: QueueEntry = {
      task: () => task(),
      resolve: (value) => resolve(value as T),
      reject,
      enqueuedAt: Date.now(),
      warnAfterMs,
    }
    if (opts?.onWait) entry.onWait = opts.onWait
    state.queue.push(entry)
    drainLane(cleaned)
  })
}

export const getLaneStats = (lane: string) => {
  const resolved = lane.trim() || CommandLane.Internal
  const state = lanes.get(resolved)
  if (!state) return { queued: 0, active: 0, maxConcurrent: 1 }
  return {
    queued: state.queue.length,
    active: state.active,
    maxConcurrent: state.maxConcurrent,
  }
}
