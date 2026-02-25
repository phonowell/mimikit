import { nowIso, shortId } from '../shared/utils.js'
import { appendJsonl, readJsonl, writeJsonl } from '../storage/jsonl.js'
import { runSerialized } from '../storage/serialized-lock.js'

import type { StatePaths } from '../fs/paths.js'
import type { JsonPacket, TaskResult, UserInput } from '../types/index.js'

type PacketWithCursor<TPayload> = JsonPacket<TPayload> & { cursor: number }

const normalizeCursor = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

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

const compactQueueIfFullyConsumed = (params: {
  packetsPath: string
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
    return true
  })

const createQueueOps = <T>(packets: (p: StatePaths) => string) => ({
  publish: (params: { paths: StatePaths; payload: T }): Promise<void> =>
    appendQueuePacket({ path: packets(params.paths), payload: params.payload }),
  consume: (params: {
    paths: StatePaths
    fromCursor: number
    limit?: number
  }): Promise<Array<PacketWithCursor<T>>> =>
    consumeQueuePackets<T>({
      path: packets(params.paths),
      fromCursor: params.fromCursor,
      ...(params.limit ? { limit: params.limit } : {}),
    }),
  compact: (params: {
    paths: StatePaths
    cursor: number
    minPacketsToCompact: number
  }): Promise<boolean> =>
    compactQueueIfFullyConsumed({
      packetsPath: packets(params.paths),
      cursor: params.cursor,
      minPacketsToCompact: params.minPacketsToCompact,
    }),
})

const input = createQueueOps<UserInput>((p) => p.inputsPackets)
const result = createQueueOps<TaskResult>((p) => p.resultsPackets)

export const publishUserInput = input.publish
export const consumeUserInputs = input.consume
export const compactInputQueueIfFullyConsumed = input.compact

export const publishWorkerResult = result.publish
export const consumeWorkerResults = result.consume
export const compactResultQueueIfFullyConsumed = result.compact
