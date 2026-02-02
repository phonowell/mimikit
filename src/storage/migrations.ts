import { asBoolean, asNumber, asString } from '../shared/utils.js'
import {
  PLANNER_RESULT_SCHEMA_VERSION,
  TASK_SCHEMA_VERSION,
  TASK_STATUS_SCHEMA_VERSION,
  TRIGGER_SCHEMA_VERSION,
  WORKER_RESULT_SCHEMA_VERSION,
} from '../types/schema.js'

import type {
  PlannerResult,
  Task,
  TaskStatus,
  Trigger,
  TriggerSchedule,
  TriggerState,
  WorkerResult,
} from '../types/tasks.js'

const normalizeTriggerState = (raw: unknown): TriggerState | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const state = raw as TriggerState
  const normalized: TriggerState = {
    lastTriggeredAt: asString(state.lastTriggeredAt) ?? null,
    lastEvalAt: asString(state.lastEvalAt) ?? null,
    lastSeenResultId: asString(state.lastSeenResultId) ?? null,
    lastMtime: asNumber(state.lastMtime) ?? null,
    initialized: asBoolean(state.initialized) ?? false,
    runningAt: asString(state.runningAt) ?? null,
    lastError: asString(state.lastError) ?? null,
    lastDurationMs: asNumber(state.lastDurationMs) ?? null,
    nextRunAt: asString(state.nextRunAt) ?? null,
  }
  if (state.lastStatus) normalized.lastStatus = state.lastStatus
  return normalized
}

const normalizeSchedule = (raw: unknown): TriggerSchedule | undefined => {
  if (!raw || typeof raw !== 'object') return undefined
  const schedule = raw as TriggerSchedule
  if ('interval' in schedule) {
    const interval = asNumber(schedule.interval)
    if (!interval) return undefined
    return {
      interval,
      lastRunAt: asString(schedule.lastRunAt) ?? null,
      nextRunAt: asString(schedule.nextRunAt) ?? null,
    }
  }
  if ('runAt' in schedule) {
    const runAt = asString(schedule.runAt)
    if (!runAt) return undefined
    return { runAt }
  }
  return undefined
}

export const migrateTask = (raw: unknown): Task | null => {
  if (!raw || typeof raw !== 'object') return null
  const task = raw as Partial<Task>
  const id = asString(task.id)
  const prompt = asString(task.prompt)
  if (!id || !prompt) return null
  const next: Task = {
    schemaVersion: TASK_SCHEMA_VERSION,
    id,
    type: task.type ?? 'oneshot',
    prompt,
    priority: asNumber(task.priority) ?? 5,
    createdAt: asString(task.createdAt) ?? new Date().toISOString(),
    attempts: asNumber(task.attempts) ?? 0,
    timeout: task.timeout ?? null,
    deferUntil: asString(task.deferUntil) ?? null,
  }
  if (task.traceId) next.traceId = task.traceId
  if (task.parentTaskId) next.parentTaskId = task.parentTaskId
  if (task.sourceTriggerId) next.sourceTriggerId = task.sourceTriggerId
  if (task.triggeredAt) next.triggeredAt = task.triggeredAt
  return next
}

export const migrateTrigger = (raw: unknown): Trigger | null => {
  if (!raw || typeof raw !== 'object') return null
  const trigger = raw as Partial<Trigger>
  const id = asString(trigger.id)
  const prompt = asString(trigger.prompt)
  if (!id || !prompt || !trigger.type) return null
  const schedule = normalizeSchedule(trigger.schedule)
  const next: Trigger = {
    schemaVersion: TRIGGER_SCHEMA_VERSION,
    id,
    type: trigger.type,
    prompt,
    priority: asNumber(trigger.priority) ?? 5,
    createdAt: asString(trigger.createdAt) ?? new Date().toISOString(),
    timeout: trigger.timeout ?? null,
  }
  if (schedule) next.schedule = schedule
  if (trigger.condition) next.condition = trigger.condition
  const cooldown = asNumber(trigger.cooldown)
  if (cooldown !== undefined) next.cooldown = cooldown
  const state = normalizeTriggerState(trigger.state)
  if (state) next.state = state
  if (trigger.traceId) next.traceId = trigger.traceId
  if (trigger.parentTaskId) next.parentTaskId = trigger.parentTaskId
  return next
}

export const migratePlannerResult = (raw: unknown): PlannerResult | null => {
  if (!raw || typeof raw !== 'object') return null
  const result = raw as Partial<PlannerResult>
  const id = asString(result.id)
  const { status } = result
  if (!id || !status) return null
  const next: PlannerResult = {
    schemaVersion: PLANNER_RESULT_SCHEMA_VERSION,
    id,
    status,
    attempts: asNumber(result.attempts) ?? 0,
    completedAt: asString(result.completedAt) ?? new Date().toISOString(),
  }
  if (Array.isArray(result.tasks)) next.tasks = result.tasks
  if (Array.isArray(result.triggers)) next.triggers = result.triggers
  if (result.question) next.question = result.question
  if (Array.isArray(result.options))
    next.options = result.options.filter((opt) => typeof opt === 'string')

  if (result.default) next.default = result.default
  if (result.error) next.error = result.error
  if (result.traceId) next.traceId = result.traceId
  return next
}

export const migrateWorkerResult = (raw: unknown): WorkerResult | null => {
  if (!raw || typeof raw !== 'object') return null
  const result = raw as Partial<WorkerResult>
  const id = asString(result.id)
  const { status } = result
  if (!id || !status) return null
  const taskRaw = result.task
  let task: WorkerResult['task']
  if (taskRaw && typeof taskRaw === 'object') {
    const prompt = asString((taskRaw as { prompt?: unknown }).prompt) ?? ''
    const priority = asNumber((taskRaw as { priority?: unknown }).priority) ?? 5
    const createdAt =
      asString((taskRaw as { createdAt?: unknown }).createdAt) ??
      new Date().toISOString()
    const timeout = asNumber((taskRaw as { timeout?: unknown }).timeout) ?? null
    task = { prompt, priority, createdAt, timeout }
    const traceId = asString((taskRaw as { traceId?: unknown }).traceId)
    const parentTaskId = asString(
      (taskRaw as { parentTaskId?: unknown }).parentTaskId,
    )
    const sourceTriggerId = asString(
      (taskRaw as { sourceTriggerId?: unknown }).sourceTriggerId,
    )
    const triggeredAt = asString(
      (taskRaw as { triggeredAt?: unknown }).triggeredAt,
    )
    if (traceId) task.traceId = traceId
    if (parentTaskId) task.parentTaskId = parentTaskId
    if (sourceTriggerId) task.sourceTriggerId = sourceTriggerId
    if (triggeredAt) task.triggeredAt = triggeredAt
  }
  const next: WorkerResult = {
    schemaVersion: WORKER_RESULT_SCHEMA_VERSION,
    id,
    status,
    resultType: result.resultType ?? 'text',
    result: result.result ?? '',
    attempts: asNumber(result.attempts) ?? 0,
    completedAt: asString(result.completedAt) ?? new Date().toISOString(),
  }
  if (result.error) next.error = result.error
  if (result.failureReason) next.failureReason = result.failureReason
  if (result.traceId) next.traceId = result.traceId
  if (result.sourceTriggerId) next.sourceTriggerId = result.sourceTriggerId
  if (result.startedAt) next.startedAt = result.startedAt
  if (result.durationMs !== undefined) next.durationMs = result.durationMs
  if (task) next.task = task
  return next
}

export const migrateTaskStatus = (raw: unknown): TaskStatus | null => {
  if (!raw || typeof raw !== 'object') return null
  const status = raw as Partial<TaskStatus>
  const id = asString(status.id)
  const completedAt = asString(status.completedAt)
  if (!id || !status.status || !completedAt) return null
  const next: TaskStatus = {
    schemaVersion: TASK_STATUS_SCHEMA_VERSION,
    id,
    status: status.status,
    completedAt,
    resultId: asString(status.resultId) ?? id,
  }
  if (status.sourceTriggerId) next.sourceTriggerId = status.sourceTriggerId
  if (status.failureReason) next.failureReason = status.failureReason
  if (status.traceId) next.traceId = status.traceId
  return next
}

export const migrateTaskStatusIndex = (
  raw: unknown,
): Record<string, TaskStatus> => {
  if (!raw || typeof raw !== 'object') return {}
  const index = raw as Record<string, unknown>
  const next: Record<string, TaskStatus> = {}
  for (const [key, value] of Object.entries(index)) {
    const migrated = migrateTaskStatus(value)
    if (migrated) next[key] = migrated
  }
  return next
}
