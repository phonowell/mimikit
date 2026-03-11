import { appendLog } from '../../log/append.js'
import { bestEffort } from '../../log/safe.js'
import { readJsonl } from '../../storage/jsonl.js'

import type { RuntimeState } from './runtime-state.js'
import type { JsonPacket } from '../../types/index.js'

export type RuntimeQueueReconcileSlice = Pick<
  RuntimeState,
  'paths' | 'queues'
> & {
  manager: Pick<RuntimeState['manager'], 'memoryRefresh'>
}

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

export const reconcileRuntimeQueueState = async (
  runtime: RuntimeQueueReconcileSlice,
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
