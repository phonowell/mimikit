import { parseIsoMs } from '../../foundation/shared/time.js'

import { resolveNextCronRunAtMs } from './plan-cron.js'

import type { TaskPlan } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const pickEarlier = (
  current: number | undefined,
  candidate: number | undefined,
): number | undefined => {
  if (candidate === undefined) return current
  if (current === undefined) return candidate
  return Math.min(current, candidate)
}

const isPlanRunnable = (plan: TaskPlan): boolean => {
  if (plan.status !== 'active') return false
  if (plan.maxRuns === undefined) return true
  return plan.runtime.runCount < plan.maxRuns
}

const resolvePlanWakeAtMs = (plan: TaskPlan, now: Date): number | undefined => {
  if (!isPlanRunnable(plan)) return undefined
  if (plan.trigger.mode === 'on_worker_slot_freed') return undefined
  if (plan.trigger.mode === 'scheduled_at') {
    const scheduledAtMs = parseIsoMs(plan.trigger.scheduledAt)
    if (scheduledAtMs === undefined) return undefined
    if (plan.runtime.lastTriggeredAt) return undefined
    return scheduledAtMs
  }
  try {
    return resolveNextCronRunAtMs(plan.trigger.cron, plan.trigger.timeZone, now)
  } catch {
    return undefined
  }
}

export const resolveManagerIdleTimeoutMs = (
  runtime: ManagerRuntime,
  now: Date = new Date(),
): number => {
  const nowMs = now.getTime()
  let nextWakeAtMs: number | undefined

  for (const plan of runtime.taskPlans)
    nextWakeAtMs = pickEarlier(nextWakeAtMs, resolvePlanWakeAtMs(plan, now))

  if (nextWakeAtMs === undefined) return Number.POSITIVE_INFINITY
  return Math.max(0, nextWakeAtMs - nowMs)
}
