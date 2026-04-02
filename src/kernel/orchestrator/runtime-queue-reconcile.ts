import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { readJsonl } from '../../persistence/storage/jsonl.js'

import type { RuntimeState } from './runtime-state.js'
import type { JsonPacket } from '../../foundation/types/index.js'

export type RuntimeQueueReconcileSlice = Pick<RuntimeState, 'paths'> & {
  domain: Pick<RuntimeState['domain'], 'queues'>
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
  const prevInputsCursor = runtime.domain.queues.inputsCursor
  const prevResultsCursor = runtime.domain.queues.resultsCursor

  runtime.domain.queues.inputsCursor = resetStaleCursor(
    runtime.domain.queues.inputsCursor,
    inputsPacketCount,
  )
  runtime.domain.queues.resultsCursor = resetStaleCursor(
    runtime.domain.queues.resultsCursor,
    resultsPacketCount,
  )

  const changed =
    runtime.domain.queues.inputsCursor !== prevInputsCursor ||
    runtime.domain.queues.resultsCursor !== prevResultsCursor
  if (!changed) return

  await bestEffort('appendLog: runtime_queue_state_reconciled', () =>
    appendLog(runtime.paths.log, {
      event: 'runtime_queue_state_reconciled',
      inputsPacketCount,
      resultsPacketCount,
      prevInputsCursor,
      prevResultsCursor,
      nextInputsCursor: runtime.domain.queues.inputsCursor,
      nextResultsCursor: runtime.domain.queues.resultsCursor,
    }),
  )
}
