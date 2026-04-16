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
  batchId?: string
  roundId?: string
  providerCallId?: string
  traceRef?: string
  attempt?: number
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
  promptSections?: {
    system: number
    action_surface: number
    state_packet: number
    event_packet: number
    remembered_memory: number
    memory: number
  }
  promptSelection?: {
    tasks: {
      selected: number
      full: number
      card: number
    }
    plans: {
      selected: number
      full: number
      card: number
    }
  }
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
  batchId?: string
  roundId?: string
  providerCallId?: string
  traceRef?: string
  attempt?: number
  promptSections?: UsageLedgerEntry['promptSections']
  promptSelection?: UsageLedgerEntry['promptSelection']
}): Promise<void> =>
  appendUsageLedgerEntry(params.stateDir, {
    kind: 'manager_round',
    ...(params.batchId?.trim() ? { batchId: params.batchId.trim() } : {}),
    ...(params.roundId?.trim() ? { roundId: params.roundId.trim() } : {}),
    ...(params.providerCallId?.trim()
      ? { providerCallId: params.providerCallId.trim() }
      : {}),
    ...(params.traceRef?.trim() ? { traceRef: params.traceRef.trim() } : {}),
    ...(typeof params.attempt === 'number' ? { attempt: params.attempt } : {}),
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
    ...(params.promptSections ? { promptSections: params.promptSections } : {}),
    ...(params.promptSelection
      ? { promptSelection: params.promptSelection }
      : {}),
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
  providerCallId?: string
  traceRef?: string
  attempt?: number
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
    ...(params.providerCallId?.trim()
      ? { providerCallId: params.providerCallId.trim() }
      : {}),
    ...(params.traceRef?.trim() ? { traceRef: params.traceRef.trim() } : {}),
    ...(typeof params.attempt === 'number' ? { attempt: params.attempt } : {}),
  })
