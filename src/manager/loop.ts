import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { waitForManagerLoopSignal } from '../orchestrator/core/signals.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { consumeUserInputs, consumeWorkerResults } from '../streams/queues.js'

import { processManagerBatch } from './loop-batch.js'
import { createUiStreamId } from './loop-ui-stream.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const managerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    const inputPackets = await consumeUserInputs({
      paths: runtime.paths,
      fromCursor: runtime.queues.inputsCursor,
    })
    const allResultPackets = await consumeWorkerResults({
      paths: runtime.paths,
      fromCursor: runtime.queues.resultsCursor,
    })
    const nextInputsCursor =
      inputPackets.at(-1)?.cursor ?? runtime.queues.inputsCursor
    const nextResultsCursor =
      allResultPackets.at(-1)?.cursor ?? runtime.queues.resultsCursor

    const resultPackets = []
    for (const packet of allResultPackets) {
      const { taskId } = packet.payload as { taskId?: unknown }
      const hasTaskId = typeof taskId === 'string' && taskId.trim().length > 0
      if (hasTaskId) {
        resultPackets.push(packet)
        continue
      }
      await bestEffort('appendLog: invalid_worker_result_packet', () =>
        appendLog(runtime.paths.log, {
          event: 'invalid_worker_result_packet',
          packetId: packet.id,
          cursor: packet.cursor,
        }),
      )
    }

    if (inputPackets.length === 0 && resultPackets.length === 0) {
      if (nextResultsCursor !== runtime.queues.resultsCursor) {
        runtime.queues.resultsCursor = nextResultsCursor
        await bestEffort('persistRuntimeState: invalid_result_packet', () =>
          persistRuntimeState(runtime),
        )
        continue
      }
      await waitForManagerLoopSignal(runtime, Number.POSITIVE_INFINITY)
      continue
    }

    await processManagerBatch({
      runtime,
      inputs: inputPackets.map((packet) => packet.payload),
      results: resultPackets.map((packet) => packet.payload),
      nextInputsCursor,
      nextResultsCursor,
      streamId: createUiStreamId(nextInputsCursor, nextResultsCursor),
    })
  }
}
