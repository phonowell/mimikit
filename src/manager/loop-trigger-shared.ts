import { publishManagerSystemEventInput } from './system-input-event.js'
import { hasNonIdleManagerInput } from './idle-input.js'
import { parseIsoMs } from '../shared/time.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../types/index.js'

export const IDLE_CHECK_INTERVAL_MS = 1_000
export const WORKER_SLOT_EVENT_COOLDOWN_MS = 1_000

const hasPendingOrRunningTask = (runtime: RuntimeState): boolean =>
  runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )

export type WorkerSlotCapacity = {
  maxSlots: number
  occupiedSlots: number
  availableSlots: number
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

export const hasFreeWorkerSlot = (runtime: RuntimeState): boolean =>
  resolveWorkerSlotCapacity(runtime).availableSlots > 0

export const isWorkerBusy = (runtime: RuntimeState): boolean =>
  runtime.runningControllers.size > 0 ||
  runtime.workerQueue.size > 0 ||
  hasPendingOrRunningTask(runtime)

export const isManagerBusy = (runtime: RuntimeState): boolean =>
  runtime.pendingUserChoice !== null ||
  runtime.managerRunning ||
  runtime.managerWakePending ||
  hasNonIdleManagerInput(runtime.inflightInputs)

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

export const canFireOnIdle = (plan: TaskPlan, nowMs: number): boolean => {
  if (plan.status !== 'active') return false
  if (plan.trigger.mode !== 'on_idle') return false
  if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns)
    return false
  const cooldownMs = Math.max(0, plan.trigger.cooldownMs)
  if (cooldownMs === 0) return true
  if (!plan.lastCompletedAt) return true
  const lastCompletedMs = parseIsoMs(plan.lastCompletedAt)
  if (lastCompletedMs === undefined) return true
  return nowMs - lastCompletedMs >= cooldownMs
}

export const canFireOnWorkerSlotFreed = (plan: TaskPlan): boolean => {
  if (plan.status !== 'active') return false
  if (plan.trigger.mode !== 'on_worker_slot_freed') return false
  if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns)
    return false
  return true
}

export const firePlan = async (params: {
  runtime: RuntimeState
  plan: TaskPlan
  nowIso: string
  reason: 'cron' | 'scheduled_at' | 'on_idle' | 'on_worker_slot_freed'
}): Promise<void> => {
  const { runtime, plan, nowIso } = params
  plan.runCount += 1
  plan.lastTriggeredAt = nowIso
  plan.updatedAt = nowIso

  if (plan.trigger.mode === 'scheduled_at') {
    markPlanDone(plan, nowIso, 'completed')
  }

  await publishManagerSystemEventInput({
    runtime,
    summary: `Task plan "${plan.title.trim() || plan.id}" was triggered.`,
    event: 'trigger_fire',
    visibility: 'all',
    payload: {
      plan_id: plan.id,
      title: plan.title,
      prompt: plan.prompt,
      trigger_mode: plan.trigger.mode,
      priority: plan.priority,
      source: plan.source,
      run_count: plan.runCount,
      ...(plan.maxRuns !== undefined ? { max_runs: plan.maxRuns } : {}),
      triggered_at: nowIso,
      ...(plan.trigger.mode === 'cron' ? { cron: plan.trigger.cron } : {}),
      ...(plan.trigger.mode === 'scheduled_at'
        ? { scheduled_at: plan.trigger.scheduledAt }
        : {}),
      ...(plan.trigger.mode === 'on_idle'
        ? { cooldown_ms: plan.trigger.cooldownMs }
        : {}),
    },
    createdAt: nowIso,
    focusId: plan.focusId,
    logEvent: 'trigger_fire_input',
    logMeta: {
      planId: plan.id,
      triggerMode: plan.trigger.mode,
      focusId: plan.focusId,
      runCount: plan.runCount,
    },
  })
}
