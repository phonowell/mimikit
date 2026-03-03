import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyManagerLoop, notifyUiSignal } from '../orchestrator/core/signals.js'
import { resolvePendingUserChoiceTimeout } from '../orchestrator/core/user-choice.js'
import { sleep } from '../shared/utils.js'

import {
  checkScheduledPlans,
  triggerOnIdlePlans,
  triggerOnWorkerSlotAvailablePlans,
} from './loop-trigger-plans.js'
import {
  IDLE_CHECK_INTERVAL_MS,
  WORKER_SLOT_EVENT_COOLDOWN_MS,
  hasWorkerSlotAvailable,
  isManagerBusy,
  isWorkerBusy,
  resolveWorkerSlotCapacity,
} from './loop-trigger-shared.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export const triggerWakeLoop = async (runtime: RuntimeState): Promise<void> => {
  let publishedIdleForCurrentWindow = false
  let lastActivityKey = ''
  let lastWorkerSlotAvailable: boolean | null = null
  let workerSlotEventPending = false
  let lastWorkerSlotEventAtMs = 0
  const idleTriggerDelayMs = Math.max(0, runtime.config.manager.idleTrigger.delayMs)

  while (!runtime.stopped) {
    try {
      const now = new Date()
      const nowMs = now.getTime()
      const activityKey = `${runtime.lastManagerActivityAtMs}:${runtime.lastWorkerActivityAtMs}`
      if (activityKey !== lastActivityKey) {
        lastActivityKey = activityKey
        publishedIdleForCurrentWindow = false
      }

      let stateChanged = false
      let triggeredCount = 0

      if (await resolvePendingUserChoiceTimeout(runtime, nowMs)) {
        stateChanged = true
        triggeredCount += 1
        notifyUiSignal(runtime)
      }

      const scheduled = await checkScheduledPlans(runtime, now)
      stateChanged = stateChanged || scheduled.stateChanged
      triggeredCount += scheduled.triggeredCount

      const workerSlotAvailable = hasWorkerSlotAvailable(runtime)
      if (lastWorkerSlotAvailable === null) {
        lastWorkerSlotAvailable = workerSlotAvailable
      } else if (lastWorkerSlotAvailable !== workerSlotAvailable) {
        lastWorkerSlotAvailable = workerSlotAvailable
        if (workerSlotAvailable) workerSlotEventPending = true
      }

      if (
        workerSlotEventPending &&
        workerSlotAvailable &&
        nowMs - lastWorkerSlotEventAtMs >= WORKER_SLOT_EVENT_COOLDOWN_MS
      ) {
        const slotTriggered = await triggerOnWorkerSlotAvailablePlans(runtime, nowMs)
        stateChanged = stateChanged || slotTriggered.stateChanged
        triggeredCount += slotTriggered.triggeredCount

        if (slotTriggered.triggeredCount === 0) {
          const capacity = resolveWorkerSlotCapacity(runtime)
          await publishManagerSystemEventInput({
            runtime,
            summary: 'A worker slot is available for new tasks.',
            event: 'worker_slot_available',
            visibility: 'all',
            payload: {
              available_slots: capacity.availableSlots,
              occupied_slots: capacity.occupiedSlots,
              max_slots: capacity.maxSlots,
              triggered_at: now.toISOString(),
            },
            createdAt: now.toISOString(),
            logEvent: 'worker_slot_available_input',
            logMeta: {
              availableSlots: capacity.availableSlots,
              occupiedSlots: capacity.occupiedSlots,
              maxSlots: capacity.maxSlots,
            },
          })
          triggeredCount += 1
        }

        workerSlotEventPending = false
        lastWorkerSlotEventAtMs = nowMs
      }

      const idleSinceMs = Math.max(
        runtime.lastManagerActivityAtMs,
        runtime.lastWorkerActivityAtMs,
      )
      const idleForMs = nowMs - idleSinceMs
      const idleReady =
        !isManagerBusy(runtime) &&
        !isWorkerBusy(runtime) &&
        idleForMs >= idleTriggerDelayMs

      if (!publishedIdleForCurrentWindow && idleReady) {
        const idleTriggered = await triggerOnIdlePlans(runtime, nowMs)
        stateChanged = stateChanged || idleTriggered.stateChanged
        triggeredCount += idleTriggered.triggeredCount

        if (idleTriggered.triggeredCount === 0) {
          const idleSince = new Date(idleSinceMs).toISOString()
          await publishManagerSystemEventInput({
            runtime,
            summary: 'The system is currently idle.',
            event: 'idle',
            visibility: 'all',
            payload: {
              idle_since: idleSince,
              triggered_at: now.toISOString(),
            },
            createdAt: now.toISOString(),
            logEvent: 'idle_trigger_input',
            logMeta: {
              idleSince,
              idleForMs,
            },
          })
          triggeredCount += 1
        }

        publishedIdleForCurrentWindow = true
      }

      if (stateChanged) {
        await bestEffort('persistRuntimeState: trigger_state', () =>
          persistRuntimeState(runtime),
        )
      }
      if (triggeredCount > 0) notifyManagerLoop(runtime)
    } catch (error) {
      await bestEffort('appendLog: trigger_wake_error', () =>
        appendLog(runtime.paths.log, {
          event: 'trigger_wake_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
    await sleep(IDLE_CHECK_INTERVAL_MS)
  }
}
