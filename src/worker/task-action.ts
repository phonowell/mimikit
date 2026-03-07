import { clearTaskLiveOutput } from './live-output.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

export type TaskLookup = {
  normalizedId: string
  task?: Task
  index: number
}

export const resolveTaskLookup = (
  runtime: RuntimeState,
  taskId: string,
): TaskLookup => {
  const normalizedId = taskId.trim()
  if (!normalizedId) return { normalizedId, index: -1 }
  const index = runtime.tasks.findIndex((item) => item.id === normalizedId)
  return {
    normalizedId,
    index,
    ...(index >= 0 ? { task: runtime.tasks[index] } : {}),
  }
}

export const isDoneTaskStatus = (status: Task['status']): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'canceled'

export const isActiveTaskStatus = (status: Task['status']): boolean =>
  status === 'pending' || status === 'running' || status === 'paused'

export const touchTaskMutation = (
  runtime: RuntimeState,
  taskId: string,
): void => {
  runtime.lastWorkerActivityAtMs = Date.now()
  clearTaskLiveOutput(runtime, taskId)
}
