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

export const loadInputQueueState = (paths: StatePaths) =>
  loadQueueState(paths.inputsState)

export const saveInputQueueState = (
  paths: StatePaths,
  state: { managerCursor: number },
) => saveQueueState(paths.inputsState, state)

export const loadResultQueueState = (paths: StatePaths) =>
  loadQueueState(paths.resultsState)

export const saveResultQueueState = (
  paths: StatePaths,
  state: { managerCursor: number },
) => saveQueueState(paths.resultsState, state)

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

export const countPendingUserInputs = (params: {
  paths: StatePaths
  cursor: number
}): Promise<number> =>
  countPacketsPending(params.paths.inputsPackets, params.cursor)
