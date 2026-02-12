import { readJson, writeJson } from '../fs/json.js'
import { nowIso, shortId } from '../shared/utils.js'
import { appendJsonl, readJsonl, writeJsonl } from '../storage/jsonl.js'

import type { JsonPacket } from '../types/index.js'

type QueueState = { managerCursor: number }
export type PacketWithCursor<TPayload> = JsonPacket<TPayload> & {
  cursor: number
}

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

export const normalizeCursor = (value: unknown): number => {
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

export const consumeQueuePackets = async <TPayload>(params: {
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

export const appendQueuePacket = <TPayload>(params: {
  path: string
  payload: TPayload
}): Promise<void> =>
  runSerialized(params.path, () =>
    appendJsonl(params.path, [makePacket(params.payload)]),
  )

export const loadQueueState = async (statePath: string): Promise<QueueState> =>
  normalizeState(
    await readJson<unknown>(
      statePath,
      { ...INITIAL_QUEUE_STATE },
      {
        ensureFile: true,
      },
    ),
  )

export const saveQueueState = async (
  statePath: string,
  state: QueueState,
): Promise<void> => {
  await writeJson(statePath, {
    managerCursor: normalizeCursor(state.managerCursor),
  })
}

export const compactQueueIfFullyConsumed = (params: {
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

export const countPacketsPending = async (
  path: string,
  cursor: number,
): Promise<number> => {
  const packets = await readJsonl<JsonPacket<unknown>>(path, {
    ensureFile: true,
  })
  return Math.max(0, packets.length - normalizeCursor(cursor))
}
