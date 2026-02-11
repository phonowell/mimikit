import { readJson, writeJson } from '../fs/json.js'
import { nowIso, shortId } from '../shared/utils.js'
import { appendJsonl, readJsonl, writeJsonl } from '../storage/jsonl.js'

import type { StatePaths } from '../fs/paths.js'
import type { JsonPacket, TaskResult, UserInput } from '../types/index.js'

type QueueState = { managerCursor: number }
type PacketWithCursor<TPayload> = JsonPacket<TPayload> & { cursor: number }

const INITIAL_QUEUE_STATE: QueueState = { managerCursor: 0 }
const queueUpdateLocks = new Map<string, Promise<void>>()

const runSerialized = async <T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = queueUpdateLocks.get(key) ?? Promise.resolve()
  const safePrevious = previous.catch(() => undefined)
  let release!: () => void
  const next = new Promise<void>((resolve) => {
    release = resolve
  })
  queueUpdateLocks.set(key, next)
  await safePrevious
  try {
    return await fn()
  } finally {
    release()
    if (queueUpdateLocks.get(key) === next) queueUpdateLocks.delete(key)
  }
}

const normalizeCursor = (value: unknown): number => {
  if (typeof value !== 'number') return 0
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

const normalizeState = (value: unknown): QueueState => {
  if (!value || typeof value !== 'object') return { ...INITIAL_QUEUE_STATE }
  const record = value as { managerCursor?: unknown }
  return { managerCursor: normalizeCursor(record.managerCursor) }
}

const makePacket = <TPayload>(payload: TPayload): JsonPacket<TPayload> => ({
  id: `${shortId()}-${Date.now()}`,
  createdAt: nowIso(),
  payload,
})

const withCursor = <TPayload>(
  packets: Array<JsonPacket<TPayload>>,
): Array<PacketWithCursor<TPayload>> =>
  packets.map((packet, index) => ({ ...packet, cursor: index + 1 }))

const consumeQueuePackets = async <TPayload>(params: {
  path: string
  fromCursor: number
  limit?: number
}): Promise<Array<PacketWithCursor<TPayload>>> => {
  const all = withCursor(
    await readJsonl<JsonPacket<TPayload>>(params.path, { ensureFile: true }),
  )
  const start = normalizeCursor(params.fromCursor)
  const filtered = all.filter((item) => item.cursor > start)
  if (!params.limit || params.limit <= 0) return filtered
  return filtered.slice(0, params.limit)
}

const appendQueuePacket = <TPayload>(params: {
  path: string
  payload: TPayload
}): Promise<void> =>
  runSerialized(params.path, () =>
    appendJsonl(params.path, [makePacket(params.payload)]),
  )

const loadQueueState = async (statePath: string): Promise<QueueState> =>
  normalizeState(
    await readJson<unknown>(
      statePath,
      { ...INITIAL_QUEUE_STATE },
      {
        ensureFile: true,
      },
    ),
  )

const saveQueueState = async (
  statePath: string,
  state: QueueState,
): Promise<void> => {
  await writeJson(statePath, {
    managerCursor: normalizeCursor(state.managerCursor),
  })
}

const compactQueueIfFullyConsumed = (params: {
  packetsPath: string
  statePath: string
  cursor: number
  minPacketsToCompact: number
}): Promise<boolean> =>
  runSerialized(params.packetsPath, async () => {
    const minPackets = Math.max(1, Math.floor(params.minPacketsToCompact))
    const cursor = normalizeCursor(params.cursor)
    const packets = await readJsonl<JsonPacket<unknown>>(params.packetsPath, {
      ensureFile: true,
    })
    if (packets.length < minPackets) return false
    if (cursor < packets.length) return false
    await writeJsonl(params.packetsPath, [])
    await saveQueueState(params.statePath, { managerCursor: 0 })
    return true
  })

export const loadInputQueueState = (paths: StatePaths): Promise<QueueState> =>
  loadQueueState(paths.inputsState)

export const saveInputQueueState = (
  paths: StatePaths,
  state: QueueState,
): Promise<void> => saveQueueState(paths.inputsState, state)

export const loadResultQueueState = (paths: StatePaths): Promise<QueueState> =>
  loadQueueState(paths.resultsState)

export const saveResultQueueState = (
  paths: StatePaths,
  state: QueueState,
): Promise<void> => saveQueueState(paths.resultsState, state)

export const publishUserInput = (params: {
  paths: StatePaths
  payload: UserInput
}): Promise<void> =>
  appendQueuePacket({
    path: params.paths.inputsPackets,
    payload: params.payload,
  })

export const consumeUserInputs = (params: {
  paths: StatePaths
  fromCursor: number
  limit?: number
}): Promise<Array<PacketWithCursor<UserInput>>> =>
  consumeQueuePackets<UserInput>({
    path: params.paths.inputsPackets,
    fromCursor: params.fromCursor,
    ...(params.limit ? { limit: params.limit } : {}),
  })

export const publishWorkerResult = (params: {
  paths: StatePaths
  payload: TaskResult
}): Promise<void> =>
  appendQueuePacket({
    path: params.paths.resultsPackets,
    payload: params.payload,
  })

export const consumeWorkerResults = (params: {
  paths: StatePaths
  fromCursor: number
  limit?: number
}): Promise<Array<PacketWithCursor<TaskResult>>> =>
  consumeQueuePackets<TaskResult>({
    path: params.paths.resultsPackets,
    fromCursor: params.fromCursor,
    ...(params.limit ? { limit: params.limit } : {}),
  })

export const compactInputQueueIfFullyConsumed = (params: {
  paths: StatePaths
  cursor: number
  minPacketsToCompact: number
}): Promise<boolean> =>
  compactQueueIfFullyConsumed({
    packetsPath: params.paths.inputsPackets,
    statePath: params.paths.inputsState,
    cursor: params.cursor,
    minPacketsToCompact: params.minPacketsToCompact,
  })

export const compactResultQueueIfFullyConsumed = (params: {
  paths: StatePaths
  cursor: number
  minPacketsToCompact: number
}): Promise<boolean> =>
  compactQueueIfFullyConsumed({
    packetsPath: params.paths.resultsPackets,
    statePath: params.paths.resultsState,
    cursor: params.cursor,
    minPacketsToCompact: params.minPacketsToCompact,
  })

export const countPendingUserInputs = async (params: {
  paths: StatePaths
  cursor: number
}): Promise<number> => {
  const packets = await readJsonl<JsonPacket<UserInput>>(
    params.paths.inputsPackets,
    { ensureFile: true },
  )
  return Math.max(0, packets.length - normalizeCursor(params.cursor))
}
