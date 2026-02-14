import {
  appendQueuePacket,
  compactQueueIfFullyConsumed,
  consumeQueuePackets,
  countPacketsPending,
  type PacketWithCursor,
} from './queue-primitives.js'

import type { StatePaths } from '../fs/paths.js'
import type { TaskResult, UserInput, WakeEvent } from '../types/index.js'

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
const wake = createQueueOps<WakeEvent>((p) => p.wakesPackets)

export const publishUserInput = input.publish
export const consumeUserInputs = input.consume
export const compactInputQueueIfFullyConsumed = input.compact

export const publishWorkerResult = result.publish
export const consumeWorkerResults = result.consume
export const compactResultQueueIfFullyConsumed = result.compact

export const publishWakeEvent = wake.publish
export const consumeWakeEvents = wake.consume
export const compactWakeQueueIfFullyConsumed = wake.compact

export const countPendingUserInputs = (params: {
  paths: StatePaths
  cursor: number
}): Promise<number> =>
  countPacketsPending(params.paths.inputsPackets, params.cursor)
