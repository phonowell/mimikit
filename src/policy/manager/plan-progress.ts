import { nowIso } from '../../foundation/shared/utils.js'

import type {
  Task,
  TaskPlan,
  TaskResult,
} from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'

const resolveTriggeredPlanMatch = (
  plans: TaskPlan[],
  task: Pick<Task, 'focusId' | 'title'>,
): TaskPlan | undefined => {
  if (plans.length === 1) return plans[0]

  const focusMatches = plans.filter((plan) => plan.focusId === task.focusId)
  if (focusMatches.length === 1) return focusMatches[0]

  const normalizedTitle = task.title.trim()
  if (!normalizedTitle) return undefined
  const titleMatches = focusMatches.filter(
    (plan) => plan.title.trim() === normalizedTitle,
  )
  if (titleMatches.length === 1) return titleMatches[0]
  return undefined
}

export const linkTriggeredPlanToTask = (params: {
  runtime: RuntimeState
  triggeredPlanIds: ReadonlySet<string> | undefined
  task: Pick<Task, 'id' | 'focusId' | 'title'>
  linkedAt?: string
}): boolean => {
  const { runtime, triggeredPlanIds, task } = params
  if (!triggeredPlanIds || triggeredPlanIds.size === 0) return false

  const candidates = runtime.taskPlans.filter((plan) =>
    triggeredPlanIds.has(plan.id),
  )
  const matchedPlan = resolveTriggeredPlanMatch(candidates, task)
  const nextTaskId = task.id.trim()
  if (
    !matchedPlan ||
    !nextTaskId ||
    matchedPlan.runtime.lastTaskId === nextTaskId
  )
    return false

  matchedPlan.runtime = {
    ...matchedPlan.runtime,
    lastTaskId: nextTaskId,
  }
  matchedPlan.updatedAt = params.linkedAt ?? nowIso()
  return true
}

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
      Date.parse(result.completedAt) >= Date.parse(existing.completedAt)
    )
      latestByTaskId.set(result.taskId, result)
  }

  for (const plan of runtime.taskPlans) {
    const taskId = plan.runtime.lastTaskId?.trim()
    if (!taskId) continue
    const matched = latestByTaskId.get(taskId)
    if (!matched) continue
    plan.updatedAt = matched.completedAt
  }
}
