import { join } from 'node:path'

import { newId, shortId } from '../ids.js'
import { appendLog } from '../log/append.js'
import { appendRunLog } from '../log/run-log.js'
import { logSafeError } from '../log/safe.js'
import { applyArchiveResult } from '../memory/archive-apply.js'
import { readHistory, writeHistory } from '../storage/history.js'
import {
  migratePlannerResult,
  migrateWorkerResult,
} from '../storage/migrations.js'
import { listItems, removeItem, writeItem } from '../storage/queue.js'
import { upsertTaskStatus } from '../storage/task-status.js'
import { appendTellerInbox } from '../storage/teller-inbox.js'
import { readTrigger, writeTrigger } from '../storage/triggers.js'
import { taskFromTrigger } from '../tasks/from-trigger.js'
import { summaryFromCandidates } from '../tasks/summary.js'
import { nowIso } from '../time.js'
import {
  TASK_SCHEMA_VERSION,
  TASK_STATUS_SCHEMA_VERSION,
  TRIGGER_SCHEMA_VERSION,
} from '../types/schema.js'

import type { SupervisorConfig } from '../config.js'
import type { StatePaths } from '../fs/paths.js'
import type {
  PlannerResult,
  Task,
  Trigger,
  WorkerResult,
} from '../types/tasks.js'
import type { TellerEvent } from '../types/teller.js'

const parseBool = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const t = value.toLowerCase()
    if (t.includes('true') || t.includes('yes')) return true
    if (t.includes('false') || t.includes('no')) return false
  }
  return null
}

const formatResultText = (value: unknown, limit = 2000): string | undefined => {
  if (typeof value === 'string') return value.slice(0, limit)
  try {
    const text = JSON.stringify(value)
    return text ? text.slice(0, limit) : undefined
  } catch (error) {
    void logSafeError('formatResultText: stringify', error)
    return undefined
  }
}

export const processPlannerResults = async (paths: StatePaths) => {
  const results = await listItems<PlannerResult>(
    paths.plannerResults,
    migratePlannerResult,
  )
  let needsTeller = false
  const events: TellerEvent[] = []
  for (const result of results) {
    if (result.status === 'failed') {
      needsTeller = true
      events.push({
        id: shortId(),
        kind: 'planner_failed',
        createdAt: nowIso(),
        error: result.error ?? 'planner failed',
      })
    }
    if (result.status === 'needs_input' && result.question) {
      needsTeller = true
      events.push({
        id: shortId(),
        kind: 'needs_input',
        createdAt: nowIso(),
        question: result.question,
        ...(result.options ? { options: result.options } : {}),
        ...(result.default ? { default: result.default } : {}),
      })
    }
    if (result.status === 'done') {
      if (Array.isArray(result.tasks)) {
        for (const spec of result.tasks) {
          if (!spec.prompt) continue
          const id = spec.id ?? newId()
          const traceId = spec.traceId ?? result.traceId
          const parentTaskId = spec.parentTaskId ?? result.id
          const summary = summaryFromCandidates([spec.summary, spec.prompt])
          const task: Task = {
            schemaVersion: TASK_SCHEMA_VERSION,
            id,
            type: spec.type ?? 'oneshot',
            prompt: spec.prompt,
            ...(summary ? { summary } : {}),
            priority: spec.priority ?? 5,
            createdAt: nowIso(),
            attempts: 0,
            timeout: spec.timeout ?? null,
            ...(spec.deferUntil ? { deferUntil: spec.deferUntil } : {}),
            ...(spec.sourceTriggerId
              ? { sourceTriggerId: spec.sourceTriggerId }
              : {}),
            ...(spec.triggeredAt ? { triggeredAt: spec.triggeredAt } : {}),
            ...(traceId ? { traceId } : {}),
            ...(parentTaskId ? { parentTaskId } : {}),
          }
          await writeItem(paths.workerQueue, task.id, task)
        }
      }
      if (Array.isArray(result.triggers)) {
        for (const spec of result.triggers) {
          if (!spec.prompt) continue
          const id = spec.id ?? newId()
          const traceId = spec.traceId ?? result.traceId
          const parentTaskId = spec.parentTaskId ?? result.id
          const trigger: Trigger = {
            schemaVersion: TRIGGER_SCHEMA_VERSION,
            id,
            type: spec.type,
            prompt: spec.prompt,
            priority: spec.priority ?? 5,
            createdAt: nowIso(),
            timeout: spec.timeout ?? null,
            ...(spec.schedule ? { schedule: spec.schedule } : {}),
            ...(spec.condition ? { condition: spec.condition } : {}),
            ...(spec.cooldown !== undefined ? { cooldown: spec.cooldown } : {}),
            ...(spec.state ? { state: spec.state } : {}),
            ...(traceId ? { traceId } : {}),
            ...(parentTaskId ? { parentTaskId } : {}),
          }
          await writeTrigger(paths.triggers, trigger)
        }
      }
    }
    const summary = summaryFromCandidates([
      result.summary,
      result.question,
      result.tasks?.[0]?.summary,
      result.tasks?.[0]?.prompt,
      result.triggers?.[0]?.prompt,
      result.error,
    ])
    await upsertTaskStatus(paths.taskStatus, {
      schemaVersion: TASK_STATUS_SCHEMA_VERSION,
      id: result.id,
      status: result.status,
      role: 'planner',
      completedAt: result.completedAt,
      resultId: result.id,
      ...(summary ? { summary } : {}),
      ...(result.durationMs !== undefined
        ? { durationMs: result.durationMs }
        : {}),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.traceId ? { traceId: result.traceId } : {}),
    })
    await appendLog(paths.log, {
      event: 'planner_result',
      taskId: result.id,
      status: result.status,
      tasks: Array.isArray(result.tasks) ? result.tasks.length : 0,
      triggers: Array.isArray(result.triggers) ? result.triggers.length : 0,
      ...(result.status === 'failed'
        ? { error: result.error ?? 'planner failed' }
        : {}),
    })
    await removeItem(join(paths.plannerResults, `${result.id}.json`))
  }
  await appendTellerInbox(paths.tellerInbox, events)
  return needsTeller
}

export const processWorkerResults = async (
  paths: StatePaths,
  config: SupervisorConfig,
) => {
  const results = await listItems<WorkerResult>(
    paths.workerResults,
    migrateWorkerResult,
  )
  let needsTeller = false
  let history = await readHistory(paths.history)
  const events: TellerEvent[] = []
  for (const result of results) {
    const resultPath = join(paths.workerResults, `${result.id}.json`)
    const shouldRetry =
      result.status === 'failed' &&
      result.attempts < config.retry.maxAttempts &&
      Boolean(result.task?.prompt)
    if (shouldRetry && result.task) {
      const deferUntil =
        config.retry.backoffMs > 0
          ? new Date(Date.now() + config.retry.backoffMs).toISOString()
          : null
      const summary = summaryFromCandidates([
        result.task.summary,
        result.task.prompt,
      ])
      const retryTask: Task = {
        schemaVersion: TASK_SCHEMA_VERSION,
        id: result.id,
        type: 'oneshot',
        prompt: result.task.prompt,
        ...(summary ? { summary } : {}),
        priority: result.task.priority,
        createdAt: result.task.createdAt,
        attempts: result.attempts,
        timeout: result.task.timeout ?? null,
        deferUntil,
        ...(result.task.traceId ? { traceId: result.task.traceId } : {}),
        ...(result.task.parentTaskId
          ? { parentTaskId: result.task.parentTaskId }
          : {}),
        ...(result.task.sourceTriggerId
          ? { sourceTriggerId: result.task.sourceTriggerId }
          : {}),
        ...(result.task.triggeredAt
          ? { triggeredAt: result.task.triggeredAt }
          : {}),
      }
      await writeItem(paths.workerQueue, retryTask.id, retryTask)
      await appendLog(paths.log, {
        event: 'worker_task_retry',
        taskId: result.id,
        attempts: result.attempts,
        nextAttempt: result.attempts + 1,
        deferUntil,
      })
      await removeItem(resultPath)
      continue
    }

    const summary = summaryFromCandidates([
      result.task?.summary,
      result.task?.prompt,
    ])
    const taskStatus = {
      schemaVersion: TASK_STATUS_SCHEMA_VERSION,
      id: result.id,
      status: result.status,
      role: 'worker' as const,
      completedAt: result.completedAt,
      resultId: result.id,
      ...(summary ? { summary } : {}),
      ...(result.durationMs !== undefined
        ? { durationMs: result.durationMs }
        : {}),
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.sourceTriggerId
        ? { sourceTriggerId: result.sourceTriggerId }
        : {}),
      ...(result.failureReason ? { failureReason: result.failureReason } : {}),
      ...(result.traceId ? { traceId: result.traceId } : {}),
    }
    await upsertTaskStatus(paths.taskStatus, taskStatus)

    const archiveOutcome = await applyArchiveResult({
      history,
      archiveJobsPath: paths.archiveJobs,
      taskId: result.id,
      logPath: paths.log,
      success: result.status === 'done',
      outputText: typeof result.result === 'string' ? result.result : '',
    })
    if (archiveOutcome.handled) {
      history = archiveOutcome.history
      await removeItem(resultPath)
      continue
    }
    history = archiveOutcome.history

    if (result.sourceTriggerId) {
      const trigger = await readTrigger(paths.triggers, result.sourceTriggerId)
      if (trigger) {
        const state = { ...(trigger.state ?? {}) }
        state.runningAt = null
        state.lastStatus = result.status === 'done' ? 'ok' : 'error'
        state.lastError = result.error ?? result.failureReason ?? null
        state.lastDurationMs = result.durationMs ?? null
        await appendRunLog(paths.triggerRuns, trigger.id, {
          action: 'finished',
          status: result.status === 'done' ? 'ok' : 'error',
          ...(result.error
            ? { error: result.error }
            : result.failureReason
              ? { error: result.failureReason }
              : {}),
          ...(result.durationMs !== undefined
            ? { durationMs: result.durationMs }
            : {}),
          taskId: result.id,
          triggerId: trigger.id,
          ...(result.traceId ? { traceId: result.traceId } : {}),
        })
        if (trigger.condition?.type === 'llm_eval') {
          const ok = parseBool(result.result)
          state.lastEvalAt = nowIso()
          if (ok) {
            const task = taskFromTrigger({ trigger })
            await writeItem(paths.workerQueue, task.id, task)
            state.lastTriggeredAt = nowIso()
          }
          await writeTrigger(paths.triggers, { ...trigger, state })
          await removeItem(resultPath)
          continue
        }
        await writeTrigger(paths.triggers, { ...trigger, state })
      }
    }

    needsTeller = true
    const resultText = formatResultText(result.result)
    events.push({
      id: shortId(),
      kind: 'task_result',
      createdAt: nowIso(),
      taskId: result.id,
      status: result.status,
      ...(resultText ? { result: resultText } : {}),
      ...(result.error ? { error: result.error } : {}),
    })
    await appendLog(paths.log, {
      event: 'worker_result',
      taskId: result.id,
      status: result.status,
      failureReason: result.failureReason ?? null,
      sourceTriggerId: result.sourceTriggerId ?? null,
      ...(result.error ? { error: result.error } : {}),
    })
    await removeItem(resultPath)
  }

  if (results.length > 0) await writeHistory(paths.history, history)
  await appendTellerInbox(paths.tellerInbox, events)
  return needsTeller
}
