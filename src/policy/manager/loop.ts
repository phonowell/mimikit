import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { waitForManagerLoopSignal } from '../../kernel/orchestrator/signals.js'
import {
  consumeUserInputsIncrementally,
  consumeWorkerResultsIncrementally,
  type QueueReadCheckpoint,
} from '../../kernel/streams/queues.js'
import { bestEffort } from '../../persistence/log/safe.js'

import { processManagerBatch } from './loop-batch.js'
import { resolveManagerIdleTimeoutMs } from './loop-idle-timeout.js'
import {
  filterValidResultPackets,
  syncCheckpoint,
} from './loop-result-packets.js'
import { safeProcessLoopTriggers } from './loop-triggers.js'
import { waitForResultReplayBackoff } from './result-replay-backoff.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const managerLoop = async (runtime: ManagerRuntime): Promise<void> => {
  const triggerState = {
    lastAvailableSlots: null as number | null,
    workerSlotEventPending: false,
    lastWorkerSlotEventAtMs: 0,
  }
  let inputCheckpoint: QueueReadCheckpoint = {
    cursor: runtime.domain.queues.inputsCursor,
    byteOffset: 0,
  }
  let resultCheckpoint: QueueReadCheckpoint = {
    cursor: runtime.domain.queues.resultsCursor,
    byteOffset: 0,
  }
  while (!runtime.process.session.stopped) {
    inputCheckpoint = syncCheckpoint(
      inputCheckpoint,
      runtime.domain.queues.inputsCursor,
    )
    resultCheckpoint = syncCheckpoint(
      resultCheckpoint,
      runtime.domain.queues.resultsCursor,
    )
    const triggerStateChanged = await safeProcessLoopTriggers(
      runtime,
      triggerState,
    )
    const inputRead = await consumeUserInputsIncrementally({
      paths: runtime.paths,
      checkpoint: inputCheckpoint,
    })
    const resultRead = await consumeWorkerResultsIncrementally({
      paths: runtime.paths,
      checkpoint: resultCheckpoint,
    })
    inputCheckpoint = inputRead.checkpoint
    resultCheckpoint = resultRead.checkpoint
    const inputPackets = inputRead.packets
    const allResultPackets = resultRead.packets
    const nextInputsCursor = inputCheckpoint.cursor
    const nextResultsCursor = resultCheckpoint.cursor
    const resultPackets = await filterValidResultPackets(
      runtime,
      allResultPackets,
    )
    if (
      await waitForResultReplayBackoff(
        runtime,
        inputPackets.length,
        resultPackets.length,
      )
    )
      continue

    if (inputPackets.length === 0 && resultPackets.length === 0) {
      if (nextResultsCursor !== runtime.domain.queues.resultsCursor) {
        runtime.domain.queues.resultsCursor = nextResultsCursor
        await bestEffort('persistRuntimeState: invalid_result_packet', () =>
          persistRuntimeState(runtime),
        )
        continue
      }
      if (triggerStateChanged) {
        await bestEffort('persistRuntimeState: manager_trigger_state', () =>
          persistRuntimeState(runtime),
        )
      }
      await waitForManagerLoopSignal(
        runtime,
        resolveManagerIdleTimeoutMs(runtime),
      )
      continue
    }
    await processManagerBatch({
      runtime,
      inputs: inputPackets.map((packet) => packet.payload),
      results: resultPackets.map((packet) => packet.payload),
      nextInputsCursor,
      nextResultsCursor,
    })
  }
}
