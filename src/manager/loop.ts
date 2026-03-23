import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/signals.js'
import { resolvePendingUserChoiceTimeout } from '../orchestrator/core/user-choice.js'
import {
  consumeUserInputsIncrementally,
  consumeWorkerResultsIncrementally,
  type QueueReadCheckpoint,
} from '../streams/queues.js'
import { resolveSlotStatus } from '../worker/task-state-shared.js'

import { processManagerBatch } from './loop-batch.js'
import { resolveManagerIdleTimeoutMs } from './loop-idle-timeout.js'
import {
  filterValidResultPackets,
  syncCheckpoint,
} from './loop-result-packets.js'
import {
  checkScheduledPlans,
  triggerOnWorkerSlotFreedPlans,
} from './loop-trigger-plans.js'
import { waitForResultReplayBackoff } from './result-replay-backoff.js'
import {
  type RuntimeState,
  waitForManagerLoopSignal,
} from './runtime-adapter.js'
import { publishManagerSystemEventInput } from './system-input-event.js'
const WORKER_SLOT_EVENT_COOLDOWN_MS = 1_000

const hasRunnableWorkerSlotPlan = (runtime: RuntimeState): boolean =>
  runtime.taskPlans.some((plan) => {
    if (plan.status !== 'active') return false
    if (plan.trigger.mode !== 'on_worker_slot_freed') return false
    if (plan.maxRuns === undefined) return true
    return plan.runtime.runCount < plan.maxRuns
  })

const processLoopTriggers = async (
  runtime: RuntimeState,
  state: {
    lastAvailableSlots: number | null
    workerSlotEventPending: boolean
    lastWorkerSlotEventAtMs: number
  },
): Promise<boolean> => {
  const now = new Date()
  const nowMs = now.getTime()
  let stateChanged = false
  if (await resolvePendingUserChoiceTimeout(runtime, nowMs)) {
    stateChanged = true
    notifyUiSignal(runtime)
  }
  const scheduled = await checkScheduledPlans(runtime, now)
  stateChanged = stateChanged || scheduled.stateChanged
  const slots = resolveSlotStatus(runtime)
  if (state.lastAvailableSlots === null) {
    state.lastAvailableSlots = slots.available_slots
    if (slots.available_slots > 0) state.workerSlotEventPending = true
  } else {
    if (slots.available_slots > state.lastAvailableSlots)
      state.workerSlotEventPending = true
    state.lastAvailableSlots = slots.available_slots
  }

  if (
    state.workerSlotEventPending &&
    slots.available_slots > 0 &&
    nowMs - state.lastWorkerSlotEventAtMs >= WORKER_SLOT_EVENT_COOLDOWN_MS
  ) {
    const slotTriggered = await triggerOnWorkerSlotFreedPlans(runtime, nowMs)
    stateChanged = stateChanged || slotTriggered.stateChanged
    if (slotTriggered.triggeredCount === 0) {
      const hasPendingOrRunningTask = runtime.tasks.some(
        (task) => task.status === 'pending' || task.status === 'running',
      )
      if (hasRunnableWorkerSlotPlan(runtime) || hasPendingOrRunningTask) {
        await publishManagerSystemEventInput({
          runtime,
          summary: 'A worker slot was freed for new tasks.',
          event: 'worker_slot_freed',
          visibility: 'all',
          payload: {
            ...slots,
            triggered_at: now.toISOString(),
          },
          createdAt: now.toISOString(),
          logEvent: 'worker_slot_freed_input',
          logMeta: {
            availableSlots: slots.available_slots,
            occupiedSlots: slots.occupied_slots,
            maxSlots: slots.max_slots,
          },
        })
      }
    }
    state.workerSlotEventPending = false
    state.lastWorkerSlotEventAtMs = nowMs
  }
  return stateChanged
}

const safeProcessLoopTriggers = async (
  runtime: RuntimeState,
  state: {
    lastAvailableSlots: number | null
    workerSlotEventPending: boolean
    lastWorkerSlotEventAtMs: number
  },
): Promise<boolean> => {
  try {
    return await processLoopTriggers(runtime, state)
  } catch (error) {
    await bestEffort('appendLog: trigger_wake_error', () =>
      appendLog(runtime.paths.log, {
        event: 'trigger_wake_error',
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return false
  }
}

export const managerLoop = async (runtime: RuntimeState): Promise<void> => {
  const triggerState = {
    lastAvailableSlots: null as number | null,
    workerSlotEventPending: false,
    lastWorkerSlotEventAtMs: 0,
  }
  let inputCheckpoint: QueueReadCheckpoint = {
    cursor: runtime.queues.inputsCursor,
    byteOffset: 0,
  }
  let resultCheckpoint: QueueReadCheckpoint = {
    cursor: runtime.queues.resultsCursor,
    byteOffset: 0,
  }
  while (!runtime.session.stopped) {
    inputCheckpoint = syncCheckpoint(
      inputCheckpoint,
      runtime.queues.inputsCursor,
    )
    resultCheckpoint = syncCheckpoint(
      resultCheckpoint,
      runtime.queues.resultsCursor,
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
      if (nextResultsCursor !== runtime.queues.resultsCursor) {
        runtime.queues.resultsCursor = nextResultsCursor
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
