import { resolveSlotStatus } from '../../execution/worker/task-state-shared.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import {
  checkScheduledPlans,
  hasRunnableWorkerSlotPlan,
  triggerOnWorkerSlotFreedPlans,
} from './loop-trigger-plans.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const WORKER_SLOT_EVENT_COOLDOWN_MS = 1_000

export type TriggerLoopState = {
  lastAvailableSlots: number | null
  workerSlotEventPending: boolean
  lastWorkerSlotEventAtMs: number
}

const processLoopTriggers = async (
  runtime: ManagerRuntime,
  state: TriggerLoopState,
): Promise<boolean> => {
  const now = new Date()
  const nowMs = now.getTime()
  const scheduled = await checkScheduledPlans(runtime, now)
  let { stateChanged } = scheduled
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
    const slotTriggered = await triggerOnWorkerSlotFreedPlans(
      runtime,
      nowMs,
      slots.available_slots,
    )
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
    state.lastAvailableSlots = resolveSlotStatus(runtime).available_slots
    state.workerSlotEventPending = false
    state.lastWorkerSlotEventAtMs = nowMs
  }
  return stateChanged
}

export const safeProcessLoopTriggers = async (
  runtime: ManagerRuntime,
  state: TriggerLoopState,
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
