import {
  canPersistFocusCompressedContext,
  canPersistFocusContext,
} from '../../focus/reserved.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import {
  hydrateMemoryRefreshState,
  toPersistedMemoryRefreshState,
} from '../../memory/refresh/state.js'
import { readJsonl } from '../../storage/jsonl.js'
import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../../storage/runtime-schema-version.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../../storage/runtime-snapshot.js'

import type { RuntimeState } from './runtime-state.js'
import type { JsonPacket } from '../../types/index.js'

const resetStaleCursor = (cursor: number, packetCount: number): number => {
  if (cursor <= packetCount) return cursor
  return 0
}

const readQueuePacketCount = async (path: string): Promise<number> =>
  (
    await readJsonl<JsonPacket<unknown>>(path, {
      ensureFile: true,
    })
  ).length

const normalizeManagerFocusCompressedContexts = (
  runtime: RuntimeState,
): void => {
  const focusIds = new Set(runtime.focuses.map((focus) => focus.id))
  runtime.manager.focusCompressedContexts =
    runtime.manager.focusCompressedContexts.filter(
      (item) =>
        canPersistFocusCompressedContext(item.focusId) &&
        focusIds.has(item.focusId),
    )
}

const normalizePersistedFocusContexts = (runtime: RuntimeState): void => {
  runtime.focusContexts = runtime.focusContexts.filter((item) =>
    canPersistFocusContext(item.focusId),
  )
}

const normalizeChannelTargets = (
  value:
    | {
        telegramChatId?: string | undefined
        feishuChatId?: string | undefined
      }
    | undefined,
) => {
  const telegramChatId = value?.telegramChatId?.trim()
  const feishuChatId = value?.feishuChatId?.trim()
  return {
    ...(telegramChatId ? { telegramChatId } : {}),
    ...(feishuChatId ? { feishuChatId } : {}),
  }
}

const reconcileRuntimeQueueState = async (
  runtime: RuntimeState,
): Promise<void> => {
  const [inputsPacketCount, resultsPacketCount] = await Promise.all([
    readQueuePacketCount(runtime.paths.inputsPackets),
    readQueuePacketCount(runtime.paths.resultsPackets),
  ])
  const prevInputsCursor = runtime.queues.inputsCursor
  const prevResultsCursor = runtime.queues.resultsCursor
  const prevMemoryInputsCursor =
    runtime.manager.memoryRefresh.lastProcessedInputsCursor
  const prevMemoryResultsCursor =
    runtime.manager.memoryRefresh.lastProcessedResultsCursor

  runtime.queues.inputsCursor = resetStaleCursor(
    runtime.queues.inputsCursor,
    inputsPacketCount,
  )
  runtime.queues.resultsCursor = resetStaleCursor(
    runtime.queues.resultsCursor,
    resultsPacketCount,
  )
  runtime.manager.memoryRefresh.lastProcessedInputsCursor = resetStaleCursor(
    runtime.manager.memoryRefresh.lastProcessedInputsCursor,
    inputsPacketCount,
  )
  runtime.manager.memoryRefresh.lastProcessedResultsCursor = resetStaleCursor(
    runtime.manager.memoryRefresh.lastProcessedResultsCursor,
    resultsPacketCount,
  )

  const changed =
    runtime.queues.inputsCursor !== prevInputsCursor ||
    runtime.queues.resultsCursor !== prevResultsCursor ||
    runtime.manager.memoryRefresh.lastProcessedInputsCursor !==
      prevMemoryInputsCursor ||
    runtime.manager.memoryRefresh.lastProcessedResultsCursor !==
      prevMemoryResultsCursor
  if (!changed) return

  await bestEffort('appendLog: runtime_queue_state_reconciled', () =>
    appendLog(runtime.paths.log, {
      event: 'runtime_queue_state_reconciled',
      inputsPacketCount,
      resultsPacketCount,
      prevInputsCursor,
      prevResultsCursor,
      nextInputsCursor: runtime.queues.inputsCursor,
      nextResultsCursor: runtime.queues.resultsCursor,
      prevMemoryInputsCursor,
      prevMemoryResultsCursor,
      nextMemoryInputsCursor:
        runtime.manager.memoryRefresh.lastProcessedInputsCursor,
      nextMemoryResultsCursor:
        runtime.manager.memoryRefresh.lastProcessedResultsCursor,
    }),
  )
}

export const hydrateRuntimeState = async (
  runtime: RuntimeState,
): Promise<void> => {
  const snapshot = await loadRuntimeSnapshot(runtime.config.workDir)
  runtime.tasks = snapshot.tasks
  runtime.taskPlans = snapshot.taskPlans
  runtime.focuses = snapshot.focuses ?? []
  runtime.focusContexts = snapshot.focusContexts ?? []
  normalizePersistedFocusContexts(runtime)
  runtime.manager.turn = snapshot.managerTurn ?? 0
  if (snapshot.managerThreadId)
    runtime.manager.threadId = snapshot.managerThreadId
  else delete runtime.manager.threadId
  runtime.manager.memoryRefresh = hydrateMemoryRefreshState(snapshot)
  runtime.manager.focusCompressedContexts =
    snapshot.managerFocusCompressedContexts ?? []
  runtime.manager.packetSummary = snapshot.managerPacketSummary ?? ''
  if (snapshot.managerLastContextPacket)
    runtime.manager.lastContextPacket = snapshot.managerLastContextPacket
  else delete runtime.manager.lastContextPacket
  if (snapshot.managerLastUsage)
    runtime.manager.lastUsage = snapshot.managerLastUsage
  else delete runtime.manager.lastUsage
  if (snapshot.managerUsageTotal)
    runtime.manager.usageTotal = snapshot.managerUsageTotal
  else delete runtime.manager.usageTotal
  normalizeManagerFocusCompressedContexts(runtime)
  runtime.ui.pendingUserChoice = snapshot.pendingUserChoice ?? null
  runtime.session.channelTargets = normalizeChannelTargets(
    snapshot.channelTargets,
  )
  if (snapshot.queues) {
    runtime.queues = {
      inputsCursor: snapshot.queues.inputsCursor,
      resultsCursor: snapshot.queues.resultsCursor,
    }
  }
  await reconcileRuntimeQueueState(runtime)

  if (snapshot.tasks.length > 0) {
    await bestEffort('appendLog: runtime_hydrated', () =>
      appendLog(runtime.paths.log, {
        event: 'runtime_hydrated',
        recoveredTaskCount: snapshot.tasks.length,
      }),
    )
  }
}

export const persistRuntimeState = async (
  runtime: RuntimeState,
): Promise<void> => {
  normalizePersistedFocusContexts(runtime)
  normalizeManagerFocusCompressedContexts(runtime)
  await saveRuntimeSnapshot(runtime.config.workDir, {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    tasks: selectPersistedTasks(runtime.tasks),
    taskPlans: runtime.taskPlans,
    focuses: runtime.focuses,
    focusContexts: runtime.focusContexts,
    managerTurn: runtime.manager.turn,
    ...(runtime.manager.threadId
      ? { managerThreadId: runtime.manager.threadId }
      : {}),
    queues: runtime.queues,
    ...(runtime.session.channelTargets.telegramChatId ||
    runtime.session.channelTargets.feishuChatId
      ? {
          channelTargets: normalizeChannelTargets(
            runtime.session.channelTargets,
          ),
        }
      : {}),
    ...(runtime.ui.pendingUserChoice
      ? { pendingUserChoice: runtime.ui.pendingUserChoice }
      : {}),
    memoryRefresh: toPersistedMemoryRefreshState(runtime.manager.memoryRefresh),
    ...(runtime.manager.lastContextPacket
      ? { managerLastContextPacket: runtime.manager.lastContextPacket }
      : {}),
    ...(runtime.manager.lastUsage
      ? { managerLastUsage: runtime.manager.lastUsage }
      : {}),
    ...(runtime.manager.usageTotal
      ? { managerUsageTotal: runtime.manager.usageTotal }
      : {}),
    ...(runtime.manager.focusCompressedContexts.length > 0
      ? {
          managerFocusCompressedContexts:
            runtime.manager.focusCompressedContexts,
        }
      : {}),
    ...(runtime.manager.packetSummary
      ? { managerPacketSummary: runtime.manager.packetSummary }
      : {}),
  })
}
