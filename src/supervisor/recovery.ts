import { writeJson } from '../fs/json.js'
import { readHistory, writeHistory } from '../storage/history.js'
import { listItems, removeItem } from '../storage/queue.js'
import { nowIso } from '../time.js'

import type { StatePaths } from '../fs/paths.js'
import type { PlannerResult, Task, WorkerResult } from '../types/tasks.js'

export const recoverRunning = async (paths: StatePaths) => {
  const plannerRunning = await listItems<Task>(paths.plannerRunning)
  for (const task of plannerRunning) {
    const result: PlannerResult = {
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

  const workerRunning = await listItems<Task>(paths.workerRunning)
  for (const task of workerRunning) {
    const result: WorkerResult = {
      id: task.id,
      status: 'failed',
      resultType: 'analysis',
      result: 'worker interrupted',
      attempts: task.attempts,
      failureReason: 'killed',
      completedAt: nowIso(),
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
