import { Cron } from 'croner'

import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyManagerLoop } from '../orchestrator/core/signals.js'
import { sleep } from '../shared/utils.js'

import { hasNonIdleManagerInput } from './idle-input.js'
import { publishManagerSystemEventInput } from './system-input-event.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskTemplate } from '../types/index.js'

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

const markTemplateDone = (
  template: TaskTemplate,
  doneAt: string,
  reason: TaskTemplate['doneReason'],
): void => {
  template.status = 'done'
  template.updatedAt = doneAt
  template.archivedAt = doneAt
  template.doneReason = reason
}

const maybeMarkTemplateExhausted = (
  template: TaskTemplate,
  nowIso: string,
): boolean => {
  if (template.status !== 'active') return false
  if (template.maxRuns === undefined) return false
  if (template.runCount < template.maxRuns) return false
  markTemplateDone(template, nowIso, 'exhausted')
  return true
}

const fireTemplate = async (params: {
  runtime: RuntimeState
  template: TaskTemplate
  nowIso: string
  reason: 'cron' | 'scheduled_at' | 'on_idle'
}): Promise<void> => {
  const { runtime, template, nowIso } = params
  template.runCount += 1
  template.lastTriggeredAt = nowIso
  template.updatedAt = nowIso

  if (template.trigger.mode === 'scheduled_at') {
    markTemplateDone(template, nowIso, 'completed')
  }

  await publishManagerSystemEventInput({
    runtime,
    summary: `Task template "${template.title.trim() || template.id}" was triggered.`,
    event: 'trigger_fire',
    visibility: 'all',
    payload: {
      template_id: template.id,
      title: template.title,
      prompt: template.prompt,
      trigger_mode: template.trigger.mode,
      priority: template.priority,
      source: template.source,
      run_count: template.runCount,
      ...(template.maxRuns !== undefined ? { max_runs: template.maxRuns } : {}),
      triggered_at: nowIso,
      ...(template.trigger.mode === 'cron' ? { cron: template.trigger.cron } : {}),
      ...(template.trigger.mode === 'scheduled_at'
        ? { scheduled_at: template.trigger.scheduledAt }
        : {}),
      ...(template.trigger.mode === 'on_idle'
        ? { cooldown_ms: template.trigger.cooldownMs }
        : {}),
    },
    createdAt: nowIso,
    focusId: template.focusId,
    logEvent: 'trigger_fire_input',
    logMeta: {
      templateId: template.id,
      triggerMode: template.trigger.mode,
      focusId: template.focusId,
      runCount: template.runCount,
    },
  })
}

const canFireOnIdle = (template: TaskTemplate, nowMs: number): boolean => {
  if (template.status !== 'active') return false
  if (template.trigger.mode !== 'on_idle') return false
  if (template.maxRuns !== undefined && template.runCount >= template.maxRuns)
    return false
  const cooldownMs = Math.max(0, template.trigger.cooldownMs)
  if (cooldownMs === 0) return true
  if (!template.lastCompletedAt) return true
  const lastCompletedMs = Date.parse(template.lastCompletedAt)
  if (!Number.isFinite(lastCompletedMs)) return true
  return nowMs - lastCompletedMs >= cooldownMs
}

const checkScheduledTriggers = async (
  runtime: RuntimeState,
  now: Date,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = now.toISOString()
  const nowSecond = asSecondStamp(nowIso)
  let triggeredCount = 0
  let stateChanged = false

  for (const template of runtime.taskTemplates) {
    if (template.status !== 'active') continue
    if (maybeMarkTemplateExhausted(template, nowIso)) {
      stateChanged = true
      continue
    }

    if (template.trigger.mode === 'scheduled_at') {
      const scheduledMs = Date.parse(template.trigger.scheduledAt)
      if (!Number.isFinite(scheduledMs) || now.getTime() < scheduledMs) continue
      if (template.lastTriggeredAt) continue
      await fireTemplate({
        runtime,
        template,
        nowIso,
        reason: 'scheduled_at',
      })
      triggeredCount += 1
      stateChanged = true
      continue
    }

    if (template.trigger.mode !== 'cron') continue
    if (
      template.lastTriggeredAt &&
      asSecondStamp(template.lastTriggeredAt) === nowSecond
    )
      continue

    const cron = template.trigger.cron
    let matched = false
    try {
      matched = matchesCronNow(cron, now)
    } catch (error) {
      await bestEffort('appendLog: trigger_expression_error', () =>
        appendLog(runtime.paths.log, {
          event: 'trigger_expression_error',
          templateId: template.id,
          cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      continue
    }
    if (!matched) continue

    await fireTemplate({ runtime, template, nowIso, reason: 'cron' })
    triggeredCount += 1
    stateChanged = true

    let hasNextRun = false
    try {
      hasNextRun = new Cron(cron).nextRun() !== null
    } catch (error) {
      await bestEffort('appendLog: trigger_next_run_error', () =>
        appendLog(runtime.paths.log, {
          event: 'trigger_next_run_error',
          templateId: template.id,
          cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      )
      hasNextRun = false
    }
    if (!hasNextRun) {
      markTemplateDone(template, nowIso, 'completed')
      stateChanged = true
    }
  }

  return { triggeredCount, stateChanged }
}

const triggerOnIdleTemplates = async (
  runtime: RuntimeState,
  nowMs: number,
): Promise<{ triggeredCount: number; stateChanged: boolean }> => {
  const nowIso = new Date(nowMs).toISOString()
  const items = runtime.taskTemplates
    .filter((template) => canFireOnIdle(template, nowMs))
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
  for (const template of items) {
    await fireTemplate({ runtime, template, nowIso, reason: 'on_idle' })
    if (template.maxRuns !== undefined && template.runCount >= template.maxRuns)
      markTemplateDone(template, nowIso, 'completed')
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

      const scheduled = await checkScheduledTriggers(runtime, now)
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
        const idleTriggered = await triggerOnIdleTemplates(runtime, nowMs)
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
