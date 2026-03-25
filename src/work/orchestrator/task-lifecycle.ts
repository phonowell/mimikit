export {
  createTask,
  enqueueTask,
  type EnqueueTaskResult,
} from './task-create.js'

import { nowIso } from '../../foundation/shared/utils.js'

import type { Task, TaskStatus } from '../../foundation/types/index.js'

const updateTaskStatus = (
  tasks: Task[],
  taskId: string,
  status: TaskStatus,
  patch?: Partial<Task>,
): Task | null => {
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return null
  task.status = status
  if (patch) Object.assign(task, patch)
  if (status !== 'paused') delete task.pausedAt
  return task
}

const findTaskById = (tasks: Task[], taskId: string): Task | undefined =>
  tasks.find((item) => item.id === taskId)

export const markTaskRunning = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null =>
  updateTaskStatus(tasks, taskId, 'running', {
    ...patch,
    startedAt: patch?.startedAt ?? nowIso(),
  })

export const markTaskPaused = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => {
  const task = updateTaskStatus(tasks, taskId, 'paused', {
    ...patch,
    pausedAt: patch?.pausedAt ?? nowIso(),
  })
  if (!task) return null
  delete task.startedAt
  return task
}

export const markTaskSucceeded = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => updateTaskStatus(tasks, taskId, 'succeeded', patch)

export const markTaskFailed = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => updateTaskStatus(tasks, taskId, 'failed', patch)

export const markTaskCanceled = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): Task | null => {
  const task = findTaskById(tasks, taskId)
  if (!task) return null
  task.status = 'canceled'
  Object.assign(task, {
    ...patch,
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    ...(task.durationMs !== undefined ? { durationMs: task.durationMs } : {}),
  })
  delete task.pausedAt
  return task
}
