import type { TaskResult } from '../../foundation/types/index.js'

type TaskResultState = Pick<TaskResult, 'taskStatus' | 'outcome' | 'stopReason'>

export const buildDefaultTaskResultState = (
  status: TaskResult['status'],
): TaskResultState => ({
  taskStatus: status,
  outcome: status === 'succeeded' ? 'completed' : 'blocked',
  stopReason:
    status === 'succeeded'
      ? 'completed'
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
