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

  runtime.queues.inputsCursor = resetStaleCursor(
    runtime.queues.inputsCursor,
    inputsPacketCount,
  )
  runtime.queues.resultsCursor = resetStaleCursor(
    runtime.queues.resultsCursor,
    resultsPacketCount,
  )

  const changed =
    runtime.queues.inputsCursor !== prevInputsCursor ||
    runtime.queues.resultsCursor !== prevResultsCursor
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
    }),
  )
}
