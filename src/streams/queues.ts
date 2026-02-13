import {
  appendQueuePacket,
  compactQueueIfFullyConsumed,
  consumeQueuePackets,
  countPacketsPending,
  loadQueueState,
  type PacketWithCursor,
  saveQueueState,
} from './queue-primitives.js'

import type { StatePaths } from '../fs/paths.js'
import type { TaskResult, UserInput } from '../types/index.js'

const createQueueOps = <T>(
  packets: (p: StatePaths) => string,
  state: (p: StatePaths) => string,
) => ({
  load: (paths: StatePaths) => loadQueueState(state(paths)),
  save: (paths: StatePaths, s: { managerCursor: number }) =>
    saveQueueState(state(paths), s),
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
      statePath: state(params.paths),
      cursor: params.cursor,
      minPacketsToCompact: params.minPacketsToCompact,
    }),
})

const input = createQueueOps<UserInput>(
  (p) => p.inputsPackets,
  (p) => p.inputsState,
)
const result = createQueueOps<TaskResult>(
  (p) => p.resultsPackets,
  (p) => p.resultsState,
)

export const loadInputQueueState = input.load
export const saveInputQueueState = input.save
export const publishUserInput = input.publish
export const consumeUserInputs = input.consume
export const compactInputQueueIfFullyConsumed = input.compact

export const loadResultQueueState = result.load
export const saveResultQueueState = result.save
export const publishWorkerResult = result.publish
export const consumeWorkerResults = result.consume
export const compactResultQueueIfFullyConsumed = result.compact

export const countPendingUserInputs = (params: {
  paths: StatePaths
  cursor: number
}): Promise<number> =>
  countPacketsPending(params.paths.inputsPackets, params.cursor)
