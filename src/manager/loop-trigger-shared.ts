import { GLOBAL_FOCUS_ID } from '../focus/constants.js'
import { buildPlanTriggerPayload } from '../shared/plan-payload.js'

import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../types/index.js'

export const IDLE_CHECK_INTERVAL_MS = 1_000
export const WORKER_SLOT_EVENT_COOLDOWN_MS = 1_000

export type WorkerSlotCapacity = {
  maxSlots: number
  occupiedSlots: number
  availableSlots: number
}

export type WorkerSlotStatusPayload = {
  max_slots: number
  occupied_slots: number
  available_slots: number
}

export const resolveWorkerSlotCapacity = (
  runtime: RuntimeState,
): WorkerSlotCapacity => {
  const maxSlots = Math.max(1, runtime.config.worker.maxConcurrent)
  const occupied = Math.max(
    runtime.workerQueue.pending,
    runtime.runningControllers.size,
  )
  const occupiedSlots = Math.min(maxSlots, Math.max(0, occupied))
  return {
    maxSlots,
    occupiedSlots,
    availableSlots: Math.max(0, maxSlots - occupiedSlots),
  }
}

export const toWorkerSlotStatusPayload = (
  capacity: WorkerSlotCapacity,
): WorkerSlotStatusPayload => ({
  max_slots: capacity.maxSlots,
  occupied_slots: capacity.occupiedSlots,
  available_slots: capacity.availableSlots,
})

export const hasFreeWorkerSlot = (runtime: RuntimeState): boolean =>
  resolveWorkerSlotCapacity(runtime).availableSlots > 0

export const markPlanDone = (
  plan: TaskPlan,
  doneAt: string,
  reason: TaskPlan['doneReason'],
): void => {
  plan.status = 'done'
  plan.updatedAt = doneAt
  plan.archivedAt = doneAt
  plan.doneReason = reason
}

export const maybeMarkPlanExhausted = (
  plan: TaskPlan,
  nowIso: string,
): boolean => {
  if (plan.status !== 'active') return false
  if (plan.maxRuns === undefined) return false
  if (plan.runCount < plan.maxRuns) return false
  markPlanDone(plan, nowIso, 'exhausted')
  return true
}

export const canFireOnWorkerSlotFreed = (plan: TaskPlan): boolean => {
  if (plan.status !== 'active') return false
  if (plan.trigger.mode !== 'on_worker_slot_freed') return false
  if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns) return false
  return true
}

export const firePlan = async (params: {
  runtime: RuntimeState
  plan: TaskPlan
  nowIso: string
  reason: 'cron' | 'scheduled_at' | 'on_worker_slot_freed'
}): Promise<void> => {
  const { runtime, plan, nowIso } = params
  plan.runCount += 1
  plan.lastTriggeredAt = nowIso
  plan.updatedAt = nowIso

  if (plan.trigger.mode === 'scheduled_at')
    markPlanDone(plan, nowIso, 'completed')

  await publishManagerSystemEventInput({
    runtime,
    summary: `Task plan "${plan.title.trim() || plan.id}" was triggered.`,
    event: 'trigger_fire',
    visibility: 'all',
    payload: {
      plan_id: plan.id,
      title: plan.title,
      prompt: plan.prompt,
      priority: plan.priority,
      source: plan.source,
      run_count: plan.runCount,
      slots: toWorkerSlotStatusPayload(resolveWorkerSlotCapacity(runtime)),
      ...(plan.maxRuns !== undefined ? { max_runs: plan.maxRuns } : {}),
      triggered_at: nowIso,
      ...buildPlanTriggerPayload(plan.trigger),
    },
    createdAt: nowIso,
    logEvent: 'trigger_fire_input',
    logMeta: {
      planId: plan.id,
      triggerMode: plan.trigger.mode,
      triggerReason: params.reason,
      focusId: GLOBAL_FOCUS_ID,
      runCount: plan.runCount,
    },
  })
}
