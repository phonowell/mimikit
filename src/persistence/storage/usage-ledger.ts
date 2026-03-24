import { newId, nowIso } from '../../foundation/shared/utils.js'
import { buildPaths } from '../fs/paths.js'

import { appendJsonl } from './jsonl.js'

import type {
  FocusId,
  ManagerContextPacket,
  ManagerPacketMode,
  ManagerWakeProfile,
  TokenUsage,
  WorkerProvider,
} from '../../foundation/types/index.js'

type UsageLedgerEntry = {
  id: string
  createdAt: string
  kind: 'manager_round' | 'worker_result'
  focusId?: FocusId
  focusIds?: FocusId[]
  taskId?: string
  provider?: 'openai-responses' | WorkerProvider
  model?: string
  wakeProfile?: ManagerWakeProfile
  packetMode?: ManagerPacketMode
  usage?: TokenUsage
  elapsedMs?: number
  threadId?: string
  promptBytes?: number
  promptSegmentCount?: number
  sectionDigests?: ManagerContextPacket['sectionDigests']
  includedSections?: string[]
  prunedSections?: string[]
  status?: string
}

const appendUsageLedgerEntry = async (
  stateDir: string,
  entry: Omit<UsageLedgerEntry, 'id' | 'createdAt'>,
): Promise<void> => {
  const paths = buildPaths(stateDir)
  await appendJsonl(paths.usageLedger, [
    {
      id: `packet-${newId()}`,
      createdAt: nowIso(),
      ...entry,
    },
  ])
}

export const appendManagerUsageLedgerEntry = (params: {
  stateDir: string
  wakeProfile: ManagerWakeProfile
  packetMode: ManagerPacketMode
  contextPacket: ManagerContextPacket
  usage?: TokenUsage
  elapsedMs: number
  threadId?: string | null
  model?: string
  promptBytes: number
  promptSegmentCount: number
}): Promise<void> =>
  appendUsageLedgerEntry(params.stateDir, {
    kind: 'manager_round',
    ...(params.contextPacket.workingFocusIds
      ? { focusIds: params.contextPacket.workingFocusIds }
      : {}),
    provider: 'openai-responses',
    ...(params.model?.trim() ? { model: params.model.trim() } : {}),
    wakeProfile: params.wakeProfile,
    packetMode: params.packetMode,
    ...(params.usage ? { usage: params.usage } : {}),
    elapsedMs: params.elapsedMs,
    ...(params.threadId?.trim() ? { threadId: params.threadId.trim() } : {}),
    promptBytes: params.promptBytes,
    promptSegmentCount: params.promptSegmentCount,
    ...(params.contextPacket.sectionDigests?.length
      ? { sectionDigests: params.contextPacket.sectionDigests }
      : {}),
    includedSections: params.contextPacket.includedSections,
    prunedSections: params.contextPacket.prunedSections,
  })

export const appendWorkerUsageLedgerEntry = (params: {
  stateDir: string
  focusId: FocusId
  taskId: string
  provider: WorkerProvider
  usage?: TokenUsage
  elapsedMs: number
  threadId?: string | null
  model?: string
  status: string
}): Promise<void> =>
  appendUsageLedgerEntry(params.stateDir, {
    kind: 'worker_result',
    focusId: params.focusId,
    taskId: params.taskId,
    provider: params.provider,
    ...(params.model?.trim() ? { model: params.model.trim() } : {}),
    ...(params.usage ? { usage: params.usage } : {}),
    elapsedMs: params.elapsedMs,
    ...(params.threadId?.trim() ? { threadId: params.threadId.trim() } : {}),
    status: params.status,
  })
