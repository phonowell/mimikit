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

const reconcileRuntimeQueueState = async (
  runtime: RuntimeState,
): Promise<void> => {
  const [inputsPacketCount, resultsPacketCount] = await Promise.all([
    readQueuePacketCount(runtime.paths.inputsPackets),
    readQueuePacketCount(runtime.paths.resultsPackets),
  ])
  const prevInputsCursor = runtime.queues.inputsCursor
  const prevResultsCursor = runtime.queues.resultsCursor
  const prevMemoryInputsCursor = runtime.memoryRefresh.lastProcessedInputsCursor
  const prevMemoryResultsCursor =
    runtime.memoryRefresh.lastProcessedResultsCursor

  runtime.queues.inputsCursor = resetStaleCursor(
    runtime.queues.inputsCursor,
    inputsPacketCount,
  )
  runtime.queues.resultsCursor = resetStaleCursor(
    runtime.queues.resultsCursor,
    resultsPacketCount,
  )
  runtime.memoryRefresh.lastProcessedInputsCursor = resetStaleCursor(
    runtime.memoryRefresh.lastProcessedInputsCursor,
    inputsPacketCount,
  )
  runtime.memoryRefresh.lastProcessedResultsCursor = resetStaleCursor(
    runtime.memoryRefresh.lastProcessedResultsCursor,
    resultsPacketCount,
  )

  const changed =
    runtime.queues.inputsCursor !== prevInputsCursor ||
    runtime.queues.resultsCursor !== prevResultsCursor ||
    runtime.memoryRefresh.lastProcessedInputsCursor !== prevMemoryInputsCursor ||
    runtime.memoryRefresh.lastProcessedResultsCursor !== prevMemoryResultsCursor
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
      nextMemoryInputsCursor: runtime.memoryRefresh.lastProcessedInputsCursor,
      nextMemoryResultsCursor: runtime.memoryRefresh.lastProcessedResultsCursor,
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
  runtime.activeFocusIds = snapshot.activeFocusIds ?? []
  runtime.managerTurn = snapshot.managerTurn ?? 0
  runtime.memoryRefresh = hydrateMemoryRefreshState(snapshot)
  runtime.pendingUserChoice = snapshot.pendingUserChoice ?? null
  if (snapshot.managerCompressedContext)
    runtime.managerCompressedContext = snapshot.managerCompressedContext
  else delete runtime.managerCompressedContext
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
  await saveRuntimeSnapshot(runtime.config.workDir, {
    tasks: selectPersistedTasks(runtime.tasks),
    taskPlans: runtime.taskPlans,
    focuses: runtime.focuses,
    focusContexts: runtime.focusContexts,
    activeFocusIds: runtime.activeFocusIds,
    managerTurn: runtime.managerTurn,
    queues: runtime.queues,
    ...(runtime.pendingUserChoice
      ? { pendingUserChoice: runtime.pendingUserChoice }
      : {}),
    memoryRefresh: toPersistedMemoryRefreshState(runtime.memoryRefresh),
    ...(runtime.managerCompressedContext
      ? { managerCompressedContext: runtime.managerCompressedContext }
      : {}),
  })
}
