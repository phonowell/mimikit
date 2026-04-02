import { compareIsoAsc, parseIsoMs } from '../../foundation/shared/time.js'

import {
  canFireOnWorkerSlotFreed,
  firePlan,
  markTriggeredPlanDone,
  maybeMarkPlanExhausted,
} from './loop-trigger-plan-execution.js'
import { hasNextCronRun, matchesCronNow } from './plan-cron.js'

import type { TaskPlan } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const asSecondStamp = (iso: string): string => iso.slice(0, 19)

const priorityRank = (priority: TaskPlan['priority']): number =>
  priority === 'high' ? 0 : priority === 'normal' ? 1 : 2

const sortTriggerPlans = (plans: TaskPlan[]): TaskPlan[] =>
  [...plans].sort((a, b) => {
    const rankDiff = priorityRank(a.priority) - priorityRank(b.priority)
    if (rankDiff !== 0) return rankDiff
    return compareIsoAsc(a.createdAt, b.createdAt)
  })

export const hasRunnableWorkerSlotPlan = (runtime: ManagerRuntime): boolean =>
  runtime.domain.taskPlans.some((plan) => {
    if (plan.status !== 'active') return false
    if (plan.trigger.mode !== 'on_worker_slot_freed') return false
    if (plan.maxRuns === undefined) return true
    return plan.runtime.runCount < plan.maxRuns
  })

const triggerPlans = async (params: {
  runtime: ManagerRuntime
  nowIso: string
  plans: TaskPlan[]
  reason: 'on_worker_slot_freed'
  availableSlots?: number
}): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  if (params.plans.length === 0)
    return { triggeredCount: 0, stateChanged: false }
  let remainingSlots = params.availableSlots
  if (remainingSlots !== undefined && remainingSlots <= 0)
    return { triggeredCount: 0, stateChanged: false }

  let triggeredCount = 0
  let stateChanged = false
  for (const plan of sortTriggerPlans(params.plans)) {
    if (remainingSlots !== undefined && remainingSlots <= 0) continue
    const result = await firePlan({
      runtime: params.runtime,
      plan,
      nowIso: params.nowIso,
      reason: params.reason,
    })
    markTriggeredPlanDone(plan, params.nowIso)
    triggeredCount += 1
    stateChanged = true
    if (remainingSlots !== undefined && result.consumedWorkerSlot)
      remainingSlots -= 1
  }

  return { triggeredCount, stateChanged }
}

export const checkScheduledPlans = async (
  runtime: ManagerRuntime,
  now: Date,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = now.toISOString()
  const nowSecond = asSecondStamp(nowIso)
  let triggeredCount = 0
  let stateChanged = false

  for (const plan of runtime.domain.taskPlans) {
    if (plan.status !== 'active') continue
    if (maybeMarkPlanExhausted(plan, nowIso)) {
      stateChanged = true
      continue
    }

    if (plan.trigger.mode === 'scheduled_at') {
      const scheduledMs = parseIsoMs(plan.trigger.scheduledAt)
      if (scheduledMs === undefined || now.getTime() < scheduledMs) continue
      if (plan.runtime.lastTriggeredAt) continue
      await firePlan({
        runtime,
        plan,
        nowIso,
        reason: 'scheduled_at',
      })
      triggeredCount += 1
      stateChanged = true
      continue
    }

    if (plan.trigger.mode !== 'cron') continue
    if (
      plan.runtime.lastTriggeredAt &&
      asSecondStamp(plan.runtime.lastTriggeredAt) === nowSecond
    )
      continue

    const { cron, timeZone } = plan.trigger
    let matched = false
    try {
      matched = matchesCronNow(cron, timeZone, now)
    } catch {
      continue
    }
    if (!matched) continue

    await firePlan({ runtime, plan, nowIso, reason: 'cron' })
    triggeredCount += 1
    stateChanged = true

    let hasNextRun = false
    try {
      hasNextRun = hasNextCronRun(cron, timeZone)
    } catch {
      hasNextRun = false
    }
    if (!hasNextRun) {
      markTriggeredPlanDone(plan, nowIso)
      stateChanged = true
    }
  }

  return { triggeredCount, stateChanged }
}

export const triggerOnWorkerSlotFreedPlans = (
  runtime: ManagerRuntime,
  nowMs: number,
  availableSlots: number,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = new Date(nowMs).toISOString()
  return triggerPlans({
    runtime,
    nowIso,
    plans: runtime.domain.taskPlans.filter((plan) =>
      canFireOnWorkerSlotFreed(plan),
    ),
    reason: 'on_worker_slot_freed',
    availableSlots,
  })
}
