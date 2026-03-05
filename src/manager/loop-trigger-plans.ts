import { Cron } from 'croner'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { compareIsoAsc, parseIsoMs } from '../shared/time.js'

import {
  canFireOnIdle,
  canFireOnWorkerSlotFreed,
  firePlan,
  markPlanDone,
  maybeMarkPlanExhausted,
} from './loop-trigger-shared.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

const asSecondStamp = (iso: string): string => iso.slice(0, 19)

const matchesCronNow = (expression: string, at: Date = new Date()): boolean =>
  new Cron(expression).match(at)

export const checkScheduledPlans = async (
  runtime: RuntimeState,
  now: Date,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = now.toISOString()
  const nowSecond = asSecondStamp(nowIso)
  let triggeredCount = 0
  let stateChanged = false

  for (const plan of runtime.taskPlans) {
    if (plan.status !== 'active') continue
    if (maybeMarkPlanExhausted(plan, nowIso)) {
      stateChanged = true
      continue
    }

    if (plan.trigger.mode === 'scheduled_at') {
      const scheduledMs = parseIsoMs(plan.trigger.scheduledAt)
      if (scheduledMs === undefined || now.getTime() < scheduledMs) continue
      if (plan.lastTriggeredAt) continue
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
      plan.lastTriggeredAt &&
      asSecondStamp(plan.lastTriggeredAt) === nowSecond
    )
      continue

    const { cron } = plan.trigger
    let matched = false
    try {
      matched = matchesCronNow(cron, now)
    } catch (error) {
      await bestEffort('appendLog: trigger_expression_error', () =>
        appendLog(runtime.paths.log, {
          event: 'trigger_expression_error',
          planId: plan.id,
          cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      continue
    }
    if (!matched) continue

    await firePlan({ runtime, plan, nowIso, reason: 'cron' })
    triggeredCount += 1
    stateChanged = true

    let hasNextRun = false
    try {
      hasNextRun = new Cron(cron).nextRun() !== null
    } catch (error) {
      await bestEffort('appendLog: trigger_next_run_error', () =>
        appendLog(runtime.paths.log, {
          event: 'trigger_next_run_error',
          planId: plan.id,
          cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      hasNextRun = false
    }
    if (!hasNextRun) {
      markPlanDone(plan, nowIso, 'completed')
      stateChanged = true
    }
  }

  return { triggeredCount, stateChanged }
}

export const triggerOnIdlePlans = async (
  runtime: RuntimeState,
  nowMs: number,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = new Date(nowMs).toISOString()
  const items = runtime.taskPlans
    .filter((plan) => canFireOnIdle(plan, nowMs))
    .sort((a, b) => {
      const priorityRank =
        (a.priority === 'high' ? 0 : a.priority === 'normal' ? 1 : 2) -
        (b.priority === 'high' ? 0 : b.priority === 'normal' ? 1 : 2)
      if (priorityRank !== 0) return priorityRank
      return compareIsoAsc(a.createdAt, b.createdAt)
    })

  if (items.length === 0) return { triggeredCount: 0, stateChanged: false }

  let triggeredCount = 0
  let stateChanged = false
  for (const plan of items) {
    await firePlan({ runtime, plan, nowIso, reason: 'on_idle' })
    if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns)
      markPlanDone(plan, nowIso, 'completed')
    triggeredCount += 1
    stateChanged = true
  }

  return { triggeredCount, stateChanged }
}

export const triggerOnWorkerSlotFreedPlans = async (
  runtime: RuntimeState,
  nowMs: number,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = new Date(nowMs).toISOString()
  const items = runtime.taskPlans
    .filter((plan) => canFireOnWorkerSlotFreed(plan))
    .sort((a, b) => {
      const priorityRank =
        (a.priority === 'high' ? 0 : a.priority === 'normal' ? 1 : 2) -
        (b.priority === 'high' ? 0 : b.priority === 'normal' ? 1 : 2)
      if (priorityRank !== 0) return priorityRank
      return compareIsoAsc(a.createdAt, b.createdAt)
    })

  if (items.length === 0) return { triggeredCount: 0, stateChanged: false }

  let triggeredCount = 0
  let stateChanged = false
  for (const plan of items) {
    await firePlan({
      runtime,
      plan,
      nowIso,
      reason: 'on_worker_slot_freed',
    })
    if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns)
      markPlanDone(plan, nowIso, 'completed')
    triggeredCount += 1
    stateChanged = true
  }

  return { triggeredCount, stateChanged }
}
