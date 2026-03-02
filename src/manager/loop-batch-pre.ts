import { parseIsoToMsOrZero } from '../shared/time.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { TaskResult } from '../types/index.js'

export const applyPlanCompletionState = (
  runtime: RuntimeState,
  results: TaskResult[],
): void => {
  if (results.length === 0) return
  const latestByTaskId = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = latestByTaskId.get(result.taskId)
    if (
      !existing ||
      parseIsoToMsOrZero(result.completedAt) >=
        parseIsoToMsOrZero(existing.completedAt)
    )
      latestByTaskId.set(result.taskId, result)
  }
  for (const plan of runtime.taskPlans) {
    const taskId = plan.lastTaskId?.trim()
    if (!taskId) continue
    const matched = latestByTaskId.get(taskId)
    if (!matched) continue
    plan.lastCompletedAt = matched.completedAt
    plan.updatedAt = matched.completedAt
  }
}
