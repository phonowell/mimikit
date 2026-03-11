import { readHistory } from '../../history/store.js'
import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import {
  hydrateMemoryRefreshState,
  toPersistedMemoryRefreshState,
} from '../../memory/refresh/state.js'
import { readJsonl } from '../../storage/jsonl.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
} from '../../storage/runtime-snapshot.js'

import {
  buildRuntimeSnapshot,
  normalizeChannelTargets,
  type RuntimeSnapshotPersistSlice,
  selectPersistedFocusDigests,
} from './runtime-snapshot-persist.js'
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

const restoreChannelTargetsFromHistory = async (
  runtime: RuntimeState,
  currentTargets: RuntimeState['session']['channelTargets'] = {},
): Promise<RuntimeState['session']['channelTargets']> => {
  const history = await readHistory(runtime.paths.history)
  let { telegramChatId } = currentTargets
  let { feishuChatId } = currentTargets
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
  return normalizeChannelTargets({
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
  runtime.focusDigests = selectPersistedFocusDigests(
    snapshot.focusDigests ?? [],
  )
  runtime.manager.turn = snapshot.managerTurn ?? 0
  if (snapshot.managerThreadId)
    runtime.manager.threadId = snapshot.managerThreadId
  else delete runtime.manager.threadId
  runtime.manager.memoryRefresh = hydrateMemoryRefreshState(snapshot)
  delete runtime.manager.lastContextPacket
  delete runtime.manager.lastUsage
  delete runtime.manager.usageTotal
  runtime.ui.pendingUserChoices = snapshot.pendingUserChoices ?? []
  runtime.session.channelTargets = await restoreChannelTargetsFromHistory(
    runtime,
    normalizeChannelTargets(snapshot.channelTargets),
  )
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
  runtime: RuntimeSnapshotPersistSlice,
): Promise<void> => {
  await saveRuntimeSnapshot(
    runtime.config.workDir,
    buildRuntimeSnapshot(
      runtime,
      toPersistedMemoryRefreshState(runtime.manager.memoryRefresh),
    ),
  )
}
