import type { TaskResult } from '../types/index.js'

type TaskResultState = Pick<TaskResult, 'taskStatus' | 'outcome' | 'stopReason'>

export const buildDefaultTaskResultState = (
  status: TaskResult['status'],
): TaskResultState => ({
  taskStatus: status === 'partial' ? 'paused' : status,
  outcome:
    status === 'succeeded'
      ? 'completed'
      : status === 'partial'
        ? 'partial'
        : 'blocked',
  stopReason:
    status === 'succeeded'
      ? 'completed'
      : status === 'partial'
        ? 'budget_exhausted'
        : status === 'failed'
          ? 'failed'
          : 'canceled',
})

export const applyTaskResultStateDefaults = (result: TaskResult): void => {
  const defaults = buildDefaultTaskResultState(result.status)
  result.taskStatus ??= defaults.taskStatus
  result.outcome ??= defaults.outcome
  result.stopReason ??= defaults.stopReason
}
