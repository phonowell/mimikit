import { canPersistFocusDigest } from '../../focus/reserved.js'
import { readHistory } from '../../history/store.js'
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

import { restoreTaskResumeChoiceOnHydrate } from './task-resume-choice.js'

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

const normalizePersistedFocusDigests = (runtime: RuntimeState): void => {
  runtime.focusDigests = runtime.focusDigests.filter((item) =>
    canPersistFocusDigest(item.focusId),
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

const restoreChannelTargetsFromHistory = async (
  runtime: RuntimeState,
): Promise<void> => {
  const history = await readHistory(runtime.paths.history)
  let telegramChatId: string | undefined
  let feishuChatId: string | undefined
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index]
    if (!item) break
    if (
      'telegramChatId' in item &&
      typeof item.telegramChatId === 'string' &&
      !telegramChatId
    )
      telegramChatId = item.telegramChatId.trim()
    if (
      'feishuChatId' in item &&
      typeof item.feishuChatId === 'string' &&
      !feishuChatId
    )
      feishuChatId = item.feishuChatId.trim()
    if (telegramChatId && feishuChatId) break
  }
  runtime.session.channelTargets = normalizeChannelTargets({
    ...(telegramChatId ? { telegramChatId } : {}),
    ...(feishuChatId ? { feishuChatId } : {}),
  })
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
  runtime.focusDigests = snapshot.focusDigests ?? []
  normalizePersistedFocusDigests(runtime)
  runtime.manager.turn = snapshot.managerTurn ?? 0
  if (snapshot.managerThreadId)
    runtime.manager.threadId = snapshot.managerThreadId
  else delete runtime.manager.threadId
  runtime.manager.memoryRefresh = hydrateMemoryRefreshState(snapshot)
  delete runtime.manager.lastContextPacket
  delete runtime.manager.lastUsage
  delete runtime.manager.usageTotal
  runtime.ui.pendingUserChoice = null
  await restoreChannelTargetsFromHistory(runtime)
  if (snapshot.queues) {
    runtime.queues = {
      inputsCursor: snapshot.queues.inputsCursor,
      resultsCursor: snapshot.queues.resultsCursor,
    }
  }
  await reconcileRuntimeQueueState(runtime)
  restoreTaskResumeChoiceOnHydrate(runtime)

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
  normalizePersistedFocusDigests(runtime)
  await saveRuntimeSnapshot(runtime.config.workDir, {
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    tasks: selectPersistedTasks(runtime.tasks),
    taskPlans: runtime.taskPlans,
    focuses: runtime.focuses,
    focusDigests: runtime.focusDigests,
    managerTurn: runtime.manager.turn,
    ...(runtime.manager.threadId
      ? { managerThreadId: runtime.manager.threadId }
      : {}),
    queues: runtime.queues,
    memoryRefresh: toPersistedMemoryRefreshState(runtime.manager.memoryRefresh),
  })
}
