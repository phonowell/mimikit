import { join } from 'node:path'

import { newId, shortId } from '../ids.js'
import { appendLog } from '../log/append.js'
import { applyArchiveResult } from '../memory/archive-apply.js'
import { readHistory, writeHistory } from '../storage/history.js'
import { listItems, removeItem, writeItem } from '../storage/queue.js'
import { upsertTaskStatus } from '../storage/task-status.js'
import { appendTellerInbox } from '../storage/teller-inbox.js'
import { readTrigger, writeTrigger } from '../storage/triggers.js'
import { taskFromTrigger } from '../tasks/from-trigger.js'
import { nowIso } from '../time.js'

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
  } catch {
    return undefined
  }
}

export const processPlannerResults = async (paths: StatePaths) => {
  const results = await listItems<PlannerResult>(paths.plannerResults)
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
          const task: Task = {
            id,
            type: spec.type ?? 'oneshot',
            prompt: spec.prompt,
            priority: spec.priority ?? 5,
            createdAt: nowIso(),
            attempts: 0,
            timeout: spec.timeout ?? null,
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

export const processWorkerResults = async (paths: StatePaths) => {
  const results = await listItems<WorkerResult>(paths.workerResults)
  let needsTeller = false
  let history = await readHistory(paths.history)
  const events: TellerEvent[] = []
  for (const result of results) {
    const taskStatus = {
      id: result.id,
      status: result.status,
      completedAt: result.completedAt,
      resultId: result.id,
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
      await removeItem(join(paths.workerResults, `${result.id}.json`))
      continue
    }
    history = archiveOutcome.history

    if (result.sourceTriggerId) {
      const trigger = await readTrigger(paths.triggers, result.sourceTriggerId)
      if (trigger?.condition?.type === 'llm_eval') {
        const ok = parseBool(result.result)
        const state = { ...(trigger.state ?? {}) }
        state.lastEvalAt = nowIso()
        if (ok) {
          const task = taskFromTrigger({ trigger })
          await writeItem(paths.workerQueue, task.id, task)
          state.lastTriggeredAt = nowIso()
        }
        await writeTrigger(paths.triggers, { ...trigger, state })
        await removeItem(join(paths.workerResults, `${result.id}.json`))
        continue
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
    await removeItem(join(paths.workerResults, `${result.id}.json`))
  }

  if (results.length > 0) await writeHistory(paths.history, history)
  await appendTellerInbox(paths.tellerInbox, events)
  return needsTeller
}
