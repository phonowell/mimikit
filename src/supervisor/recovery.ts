import { writeJson } from '../fs/json.js'
import { readHistory, writeHistory } from '../storage/history.js'
import { migrateTask } from '../storage/migrations.js'
import { listItems, removeItem } from '../storage/queue.js'
import { nowIso } from '../time.js'
import {
  PLANNER_RESULT_SCHEMA_VERSION,
  WORKER_RESULT_SCHEMA_VERSION,
} from '../types/schema.js'

import type { StatePaths } from '../fs/paths.js'
import type { PlannerResult, Task, WorkerResult } from '../types/tasks.js'

export const recoverRunning = async (paths: StatePaths) => {
  const plannerRunning = await listItems<Task>(
    paths.plannerRunning,
    migrateTask,
  )
  for (const task of plannerRunning) {
    const result: PlannerResult = {
      schemaVersion: PLANNER_RESULT_SCHEMA_VERSION,
      id: task.id,
      status: 'failed',
      attempts: task.attempts,
      error: 'planner interrupted',
      completedAt: nowIso(),
      ...(task.traceId ? { traceId: task.traceId } : {}),
    }
    await writeJson(`${paths.plannerResults}/${task.id}.json`, result)
    await removeItem(`${paths.plannerRunning}/${task.id}.json`)
  }

  const workerRunning = await listItems<Task>(paths.workerRunning, migrateTask)
  for (const task of workerRunning) {
    const taskSnapshot = {
      prompt: task.prompt,
      priority: task.priority,
      createdAt: task.createdAt,
      timeout: task.timeout ?? null,
      ...(task.traceId ? { traceId: task.traceId } : {}),
      ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
      ...(task.sourceTriggerId
        ? { sourceTriggerId: task.sourceTriggerId }
        : {}),
      ...(task.triggeredAt ? { triggeredAt: task.triggeredAt } : {}),
    }
    const result: WorkerResult = {
      schemaVersion: WORKER_RESULT_SCHEMA_VERSION,
      id: task.id,
      status: 'failed',
      resultType: 'analysis',
      result: 'worker interrupted',
      attempts: task.attempts,
      failureReason: 'killed',
      completedAt: nowIso(),
      task: taskSnapshot,
      ...(task.traceId ? { traceId: task.traceId } : {}),
      ...(task.sourceTriggerId
        ? { sourceTriggerId: task.sourceTriggerId }
        : {}),
    }
    await writeJson(`${paths.workerResults}/${task.id}.json`, result)
    await removeItem(`${paths.workerRunning}/${task.id}.json`)
  }

  const history = await readHistory(paths.history)
  const updated = history.map((msg) =>
    msg.archived === 'pending' ? { ...msg, archived: false } : msg,
  )
  const changed = updated.some((msg, idx) => msg !== history[idx])
  if (changed) await writeHistory(paths.history, updated)
}
