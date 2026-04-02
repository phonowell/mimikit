import { clearTaskLiveOutput } from './live-output.js'

import type { Task } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type TaskMutationMeta = {
  source?: string
  reason?: string
  resumeInstruction?: string
}

export type TaskLookup = {
  normalizedId: string
  task?: Task
  index: number
}

export type TaskLookupFailure = {
  id: string
  status: 'invalid' | 'not_found'
}

export type TaskLookupTarget = {
  id: string
  index: number
  task: Task
}

export const resolveTaskLookup = (
  runtime: WorkerRuntime,
  taskId: string,
): TaskLookup => {
  const normalizedId = taskId.trim()
  if (!normalizedId) return { normalizedId, index: -1 }
  const index = runtime.domain.tasks.findIndex(
    (item) => item.id === normalizedId,
  )
  return {
    normalizedId,
    index,
    ...(index >= 0 ? { task: runtime.domain.tasks[index] } : {}),
  }
}

export const resolveTaskLookupTarget = (
  runtime: WorkerRuntime,
  taskId: string,
): TaskLookupFailure | TaskLookupTarget => {
  const lookup = resolveTaskLookup(runtime, taskId)
  if (!lookup.normalizedId)
    return { id: lookup.normalizedId, status: 'invalid' }
  if (lookup.index < 0 || !lookup.task)
    return { id: lookup.normalizedId, status: 'not_found' }
  return {
    id: lookup.normalizedId,
    index: lookup.index,
    task: lookup.task,
  }
}

export const buildTaskMutationMetaFields = (
  meta?: TaskMutationMeta,
): Partial<TaskMutationMeta> => ({
  ...(meta?.source ? { source: meta.source } : {}),
  ...(meta?.reason ? { reason: meta.reason } : {}),
})

export const isDoneTaskStatus = (status: Task['status']): boolean =>
  status === 'succeeded' || status === 'failed' || status === 'canceled'

export const isActiveTaskStatus = (status: Task['status']): boolean =>
  status === 'pending' || status === 'running' || status === 'paused'

export const touchTaskMutation = (
  runtime: WorkerRuntime,
  taskId: string,
): void => {
  runtime.process.worker.lastActivityAtMs = Date.now()
  clearTaskLiveOutput(runtime, taskId)
}
