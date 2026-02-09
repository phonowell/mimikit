import { nowIso, shortId } from '../shared/utils.js'

import {
  appendJsonpPacket,
  consumeJsonpPackets,
  pruneJsonpPackets,
} from './jsonp-channel.js'

import type { StatePaths } from '../fs/paths.js'
import type {
  JsonPacket,
  TaskResult,
  TellerDigest,
  ThinkerDecision,
  UserInput,
} from '../types/index.js'

const makePacket = <TPayload>(payload: TPayload): JsonPacket<TPayload> => ({
  id: `${shortId()}-${Date.now()}`,
  createdAt: nowIso(),
  payload,
})

export const publishUserInput = (params: {
  paths: StatePaths
  payload: UserInput
}): Promise<number> =>
  appendJsonpPacket({
    path: params.paths.userInputChannel,
    packet: makePacket(params.payload),
  })

export const consumeUserInputs = (params: {
  paths: StatePaths
  fromCursor: number
  limit?: number
}): ReturnType<typeof consumeJsonpPackets<UserInput>> =>
  consumeJsonpPackets<UserInput>({
    path: params.paths.userInputChannel,
    fromCursor: params.fromCursor,
    ...(params.limit ? { limit: params.limit } : {}),
  })

export const publishWorkerResult = (params: {
  paths: StatePaths
  payload: TaskResult
}): Promise<number> =>
  appendJsonpPacket({
    path: params.paths.workerResultChannel,
    packet: makePacket(params.payload),
  })

export const consumeWorkerResults = (params: {
  paths: StatePaths
  fromCursor: number
  limit?: number
}): ReturnType<typeof consumeJsonpPackets<TaskResult>> =>
  consumeJsonpPackets<TaskResult>({
    path: params.paths.workerResultChannel,
    fromCursor: params.fromCursor,
    ...(params.limit ? { limit: params.limit } : {}),
  })

export const publishTellerDigest = (params: {
  paths: StatePaths
  payload: TellerDigest
}): Promise<number> =>
  appendJsonpPacket({
    path: params.paths.tellerDigestChannel,
    packet: makePacket(params.payload),
  })

export const consumeTellerDigests = (params: {
  paths: StatePaths
  fromCursor: number
  limit?: number
}): ReturnType<typeof consumeJsonpPackets<TellerDigest>> =>
  consumeJsonpPackets<TellerDigest>({
    path: params.paths.tellerDigestChannel,
    fromCursor: params.fromCursor,
    ...(params.limit ? { limit: params.limit } : {}),
  })

export const publishThinkerDecision = (params: {
  paths: StatePaths
  payload: ThinkerDecision
}): Promise<number> =>
  appendJsonpPacket({
    path: params.paths.thinkerDecisionChannel,
    packet: makePacket(params.payload),
  })

export const consumeThinkerDecisions = (params: {
  paths: StatePaths
  fromCursor: number
  limit?: number
}): ReturnType<typeof consumeJsonpPackets<ThinkerDecision>> =>
  consumeJsonpPackets<ThinkerDecision>({
    path: params.paths.thinkerDecisionChannel,
    fromCursor: params.fromCursor,
    ...(params.limit ? { limit: params.limit } : {}),
  })

export const pruneChannelBefore = (params: {
  path: string
  keepFromCursor: number
}): Promise<void> =>
  pruneJsonpPackets({
    path: params.path,
    keepFromCursor: params.keepFromCursor,
  })

export type ChannelPruneTarget = {
  path: string
  cursor: number
}

export const pruneChannelsByCursor = async (params: {
  enabled: boolean
  keepRecent: number
  targets: ChannelPruneTarget[]
}): Promise<void> => {
  if (!params.enabled) return
  const keepRecent = Math.max(1, params.keepRecent)
  const pruneOps = params.targets
    .map((target) => ({
      path: target.path,
      keepFromCursor: target.cursor - keepRecent + 1,
    }))
    .filter((target) => target.keepFromCursor > 1)
    .map((target) => pruneChannelBefore(target))
  if (pruneOps.length === 0) return
  await Promise.all(pruneOps)
}
