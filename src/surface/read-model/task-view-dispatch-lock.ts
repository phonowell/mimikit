import { buildTaskDispatchLockKey } from '../../work/shared/task-execution-target.js'

import type { Task, TaskStatus } from '../../foundation/types/index.js'

export type TaskDispatchLockDetail = {
  blockerTaskId: string
  lockKey: string
}

export const resolveDispatchLockDetail = (
  task: Task,
  tasks: Task[],
  taskStatus: TaskStatus,
): TaskDispatchLockDetail | undefined => {
  if (taskStatus !== 'pending') return undefined
  const lockKey = buildTaskDispatchLockKey(task)
  if (!lockKey) return undefined
  for (const item of tasks) {
    if (item.id === task.id || item.status !== 'running') continue
    if (buildTaskDispatchLockKey(item) !== lockKey) continue
    return {
      blockerTaskId: item.id,
      lockKey,
    }
  }
  return undefined
}
