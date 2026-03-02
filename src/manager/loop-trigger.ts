import { Cron } from 'croner'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyManagerLoop } from '../orchestrator/core/signals.js'
import { sleep } from '../shared/utils.js'

import { hasNonIdleManagerInput } from './idle-input.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../types/index.js'

const IDLE_CHECK_INTERVAL_MS = 1_000
const IDLE_TRIGGER_DELAY_MS = 15 * 60_000
const asSecondStamp = (iso: string): string => iso.slice(0, 19)

const hasPendingOrRunningTask = (runtime: RuntimeState): boolean =>
  runtime.tasks.some(
    (task) => task.status === 'pending' || task.status === 'running',
  )

const isWorkerBusy = (runtime: RuntimeState): boolean =>
  runtime.runningControllers.size > 0 ||
  runtime.workerQueue.size > 0 ||
  hasPendingOrRunningTask(runtime)

const isManagerBusy = (runtime: RuntimeState): boolean =>
  runtime.managerRunning ||
  runtime.managerWakePending ||
  hasNonIdleManagerInput(runtime.inflightInputs)

const matchesCronNow = (expression: string, at: Date = new Date()): boolean =>
  new Cron(expression).match(at)

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

const maybeMarkPlanExhausted = (
  plan: TaskPlan,
  nowIso: string,
): boolean => {
  if (plan.status !== 'active') return false
  if (plan.maxRuns === undefined) return false
  if (plan.runCount < plan.maxRuns) return false
  markPlanDone(plan, nowIso, 'exhausted')
  return true
}

const firePlan = async (params: {
  runtime: RuntimeState
  plan: TaskPlan
  nowIso: string
  reason: 'cron' | 'scheduled_at' | 'on_idle'
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

const canFireOnIdle = (plan: TaskPlan, nowMs: number): boolean => {
  if (plan.status !== 'active') return false
  if (plan.trigger.mode !== 'on_idle') return false
  if (plan.maxRuns !== undefined && plan.runCount >= plan.maxRuns)
    return false
  const cooldownMs = Math.max(0, plan.trigger.cooldownMs)
  if (cooldownMs === 0) return true
  if (!plan.lastCompletedAt) return true
  const lastCompletedMs = Date.parse(plan.lastCompletedAt)
  if (!Number.isFinite(lastCompletedMs)) return true
  return nowMs - lastCompletedMs >= cooldownMs
}

const checkScheduledPlans = async (
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
      const scheduledMs = Date.parse(plan.trigger.scheduledAt)
      if (!Number.isFinite(scheduledMs) || now.getTime() < scheduledMs) continue
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

    const cron = plan.trigger.cron
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

const triggerOnIdlePlans = async (
  runtime: RuntimeState,
  nowMs: number,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = new Date(nowMs).toISOString()
  const items = runtime.taskPlans
    .filter((plan) => canFireOnIdle(plan, nowMs))
    .sort((a, b) => {
      const p =
        (a.priority === 'high' ? 0 : a.priority === 'normal' ? 1 : 2) -
        (b.priority === 'high' ? 0 : b.priority === 'normal' ? 1 : 2)
      if (p !== 0) return p
      return Date.parse(a.createdAt) - Date.parse(b.createdAt)
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

export const triggerWakeLoop = async (runtime: RuntimeState): Promise<void> => {
  let publishedIdleForCurrentWindow = false
  let lastActivityKey = ''

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

      const scheduled = await checkScheduledPlans(runtime, now)
      stateChanged = stateChanged || scheduled.stateChanged
      triggeredCount += scheduled.triggeredCount

      const idleSinceMs = Math.max(
        runtime.lastManagerActivityAtMs,
        runtime.lastWorkerActivityAtMs,
      )
      const idleForMs = nowMs - idleSinceMs
      const idleReady =
        !isManagerBusy(runtime) &&
        !isWorkerBusy(runtime) &&
        idleForMs >= IDLE_TRIGGER_DELAY_MS

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
