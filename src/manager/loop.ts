import { appendLog } from '../log/append.js'
import { bestEffort, safe } from '../log/safe.js'
import { waitForManagerLoopSignal } from '../orchestrator/core/manager-signal.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  consumeUserInputs,
  consumeWakeEvents,
  consumeWorkerResults,
} from '../streams/queues.js'

import { processManagerBatch } from './loop-batch.js'
import { createUiStreamId } from './loop-ui-stream.js'
import { executeManagerProfileTasks } from './manager-task-runner.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const hasNonEmptyTaskId = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false
  const { taskId } = payload as { taskId?: unknown }
  return typeof taskId === 'string' && taskId.trim().length > 0
}

export const managerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    const wakePackets = await consumeWakeEvents({
      paths: runtime.paths,
      fromCursor: runtime.queues.wakesCursor,
    })
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
    const nextWakesCursor =
      wakePackets.at(-1)?.cursor ?? runtime.queues.wakesCursor

    const resultPackets = []
    for (const packet of allResultPackets) {
      if (hasNonEmptyTaskId(packet.payload)) {
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
      let wakeProgressed = false
      if (nextWakesCursor !== runtime.queues.wakesCursor) {
        runtime.queues.wakesCursor = nextWakesCursor
        await bestEffort('persistRuntimeState: wake_packet', () =>
          persistRuntimeState(runtime),
        )
        wakeProgressed = true
      }
      if (nextResultsCursor !== runtime.queues.resultsCursor) {
        runtime.queues.resultsCursor = nextResultsCursor
        await bestEffort('persistRuntimeState: invalid_result_packet', () =>
          persistRuntimeState(runtime),
        )
        continue
      }
      const executedManagerTasks = await safe(
        'executeManagerProfileTasks',
        () => executeManagerProfileTasks(runtime),
        { fallback: 0 },
      )
      if (executedManagerTasks > 0) continue
      if (wakeProgressed) continue
      await waitForManagerLoopSignal(runtime, Number.POSITIVE_INFINITY)
      continue
    }

    await processManagerBatch({
      runtime,
      inputs: inputPackets.map((packet) => packet.payload),
      results: resultPackets.map((packet) => packet.payload),
      nextInputsCursor,
      nextResultsCursor,
      nextWakesCursor,
      streamId: createUiStreamId(nextInputsCursor, nextResultsCursor),
    })
  }
}
