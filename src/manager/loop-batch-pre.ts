import type { RuntimeState } from './runtime-adapter.js'
import type { TaskResult } from '../types/index.js'

const toMs = (value: string | undefined): number => {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const applyPlanCompletionState = (
  runtime: RuntimeState,
  results: TaskResult[],
): void => {
  if (results.length === 0) return
  const latestByTaskId = new Map<string, TaskResult>()
  for (const result of results) {
    const existing = latestByTaskId.get(result.taskId)
    if (!existing || toMs(result.completedAt) >= toMs(existing.completedAt))
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
