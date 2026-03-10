import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/signals.js'
import { resolvePendingUserChoiceTimeout } from '../orchestrator/core/user-choice.js'
import { taskResultSchema } from '../storage/runtime-snapshot-schema.js'
import { consumeUserInputs, consumeWorkerResults } from '../streams/queues.js'
import { resolveSlotStatus } from '../worker/task-state-shared.js'

import { processManagerBatch } from './loop-batch.js'
import {
  checkScheduledPlans,
  triggerOnWorkerSlotFreedPlans,
} from './loop-trigger-plans.js'
import {
  type RuntimeState,
  waitForManagerLoopSignal,
} from './runtime-adapter.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

const IDLE_CHECK_INTERVAL_MS = 1_000
const WORKER_SLOT_EVENT_COOLDOWN_MS = 1_000

const formatIssuePath = (path: readonly PropertyKey[]): string => {
  if (path.length === 0) return '<root>'
  return path.map((segment) => String(segment)).join('.')
}

const hasRunnableWorkerSlotPlan = (runtime: RuntimeState): boolean =>
  runtime.taskPlans.some((plan) => {
    if (plan.status !== 'active') return false
    if (plan.trigger.mode !== 'on_worker_slot_freed') return false
    if (plan.maxRuns === undefined) return true
    return plan.runCount < plan.maxRuns
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

  while (!runtime.session.stopped) {
    const triggerStateChanged = await safeProcessLoopTriggers(
      runtime,
      triggerState,
    )
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
      const parsedResult = taskResultSchema.safeParse(packet.payload)
      if (parsedResult.success) {
        resultPackets.push({
          ...packet,
          payload: parsedResult.data,
        })
        continue
      }
      await bestEffort('appendLog: invalid_worker_result_packet', () =>
        appendLog(runtime.paths.log, {
          event: 'invalid_worker_result_packet',
          packetId: packet.id,
          cursor: packet.cursor,
          issues: parsedResult.error.issues.map(
            (issue) => `${formatIssuePath(issue.path)}: ${issue.message}`,
          ),
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
      if (triggerStateChanged) {
        await bestEffort('persistRuntimeState: manager_trigger_state', () =>
          persistRuntimeState(runtime),
        )
      }
      await waitForManagerLoopSignal(runtime, IDLE_CHECK_INTERVAL_MS)
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
