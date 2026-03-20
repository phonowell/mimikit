import { GLOBAL_FOCUS_ID } from '../focus/constants.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { buildPlanTriggerPayload } from '../shared/plan-payload.js'
import { compareIsoAsc, parseIsoMs } from '../shared/time.js'
import { resolveSlotStatus } from '../worker/task-state-shared.js'

import { hasNextCronRun, matchesCronNow } from './plan-cron.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../types/index.js'

const asSecondStamp = (iso: string): string => iso.slice(0, 19)

const priorityRank = (priority: TaskPlan['priority']): number =>
  priority === 'high' ? 0 : priority === 'normal' ? 1 : 2

const sortTriggerPlans = (plans: TaskPlan[]): TaskPlan[] =>
  [...plans].sort((a, b) => {
    const rankDiff = priorityRank(a.priority) - priorityRank(b.priority)
    if (rankDiff !== 0) return rankDiff
    return compareIsoAsc(a.createdAt, b.createdAt)
  })

const markPlanDone = (
  plan: TaskPlan,
  doneAt: string,
  reason: TaskPlan['doneReason'],
): void => {
  plan.status = 'done'
  plan.updatedAt = doneAt
  plan.archivedAt = doneAt
  plan.doneReason = reason
}

const maybeMarkPlanExhausted = (plan: TaskPlan, nowIso: string): boolean => {
  if (plan.status !== 'active') return false
  if (plan.maxRuns === undefined) return false
  if (plan.runCount < plan.maxRuns) return false
  markPlanDone(plan, nowIso, 'exhausted')
  return true
}

const canFireOnWorkerSlotFreed = (plan: TaskPlan): boolean => {
  if (plan.status !== 'active') return false
  if (plan.trigger.mode !== 'on_worker_slot_freed') return false
  if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns) return false
  return true
}

const firePlan = async (params: {
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
      slots: resolveSlotStatus(runtime),
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

    const { cron, timeZone } = plan.trigger
    let matched = false
    try {
      matched = matchesCronNow(cron, timeZone, now)
    } catch (error) {
      await bestEffort('appendLog: trigger_expression_error', () =>
        appendLog(runtime.paths.log, {
          event: 'trigger_expression_error',
          planId: plan.id,
          cron,
          ...(timeZone ? { timeZone } : {}),
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
      hasNextRun = hasNextCronRun(cron, timeZone)
    } catch (error) {
      await bestEffort('appendLog: trigger_next_run_error', () =>
        appendLog(runtime.paths.log, {
          event: 'trigger_next_run_error',
          planId: plan.id,
          cron,
          ...(timeZone ? { timeZone } : {}),
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
