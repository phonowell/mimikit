import { Cron } from 'croner'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { compareIsoAsc, parseIsoMs } from '../shared/time.js'

import {
  canFireOnWorkerSlotFreed,
  firePlan,
  markPlanDone,
  maybeMarkPlanExhausted,
} from './loop-trigger-shared.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../types/index.js'

const asSecondStamp = (iso: string): string => iso.slice(0, 19)

const matchesCronNow = (expression: string, at: Date = new Date()): boolean =>
  new Cron(expression).match(at)

const priorityRank = (priority: TaskPlan['priority']): number =>
  priority === 'high' ? 0 : priority === 'normal' ? 1 : 2

const sortTriggerPlans = (plans: TaskPlan[]): TaskPlan[] =>
  [...plans].sort((a, b) => {
    const rankDiff = priorityRank(a.priority) - priorityRank(b.priority)
    if (rankDiff !== 0) return rankDiff
    return compareIsoAsc(a.createdAt, b.createdAt)
  })

const triggerPlans = async (params: {
  runtime: RuntimeState
  nowIso: string
  plans: TaskPlan[]
  reason: 'on_worker_slot_freed'
}): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  if (params.plans.length === 0)
    return { triggeredCount: 0, stateChanged: false }

  let triggeredCount = 0
  let stateChanged = false
  for (const plan of sortTriggerPlans(params.plans)) {
    await firePlan({
      runtime: params.runtime,
      plan,
      nowIso: params.nowIso,
      reason: params.reason,
    })
    if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns)
      markPlanDone(plan, params.nowIso, 'completed')
    triggeredCount += 1
    stateChanged = true
  }

  return { triggeredCount, stateChanged }
}

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
      await bestEffort('appendLog: cron_trigger_metrics', () =>
        appendLog(runtime.paths.log, {
          event: 'cron_trigger_metrics',
          triggerMode: 'scheduled_at',
          planId: plan.id,
          outcome: 'triggered',
        }),
      )
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
    await bestEffort('appendLog: cron_trigger_metrics', () =>
      appendLog(runtime.paths.log, {
        event: 'cron_trigger_metrics',
        triggerMode: 'cron',
        planId: plan.id,
        outcome: 'triggered',
      }),
    )
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

export const triggerOnWorkerSlotFreedPlans = (
  runtime: RuntimeState,
  nowMs: number,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = new Date(nowMs).toISOString()
  return triggerPlans({
    runtime,
    nowIso,
    plans: runtime.taskPlans.filter((plan) => canFireOnWorkerSlotFreed(plan)),
    reason: 'on_worker_slot_freed',
  })
}
