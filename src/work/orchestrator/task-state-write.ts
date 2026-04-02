import { syncFocusFromTaskResult } from '../focus/result-feedback.js'

import {
  markTaskCanceled,
  markTaskPaused,
  markTaskRunning,
} from './task-lifecycle.js'

import type {
  Task,
  TaskCancelMeta,
  TaskGitExecution,
  TaskResult,
} from '../../foundation/types/index.js'
import type {
  RuntimeTaskFocusStateSlice,
  RuntimeTaskStateSlice,
} from '../../kernel/orchestrator/runtime-interfaces.js'

const findTask = (
  runtime: RuntimeTaskStateSlice,
  taskId: string,
): Task | undefined => runtime.domain.tasks.find((item) => item.id === taskId)

const resolveTaskTarget = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  task?: Task
}): Task | undefined => findTask(params.runtime, params.taskId) ?? params.task

export const pauseRuntimeTask = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  pausedAt: string
}): Task | undefined => {
  markTaskPaused(params.runtime.domain.tasks, params.taskId, {
    pausedAt: params.pausedAt,
  })
  return findTask(params.runtime, params.taskId)
}

export const resumeRuntimeTask = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  resumeInstruction?: string
}): Task | undefined => {
  const task = findTask(params.runtime, params.taskId)
  if (!task) return undefined
  task.status = 'pending'
  delete task.pausedAt
  delete task.startedAt
  delete task.completedAt
  delete task.durationMs
  delete task.archivePath
  delete task.result
  if (params.resumeInstruction)
    task.resumeInstruction = params.resumeInstruction
  else delete task.resumeInstruction
  return task
}

export const cancelRuntimeTask = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  completedAt: string
  durationMs?: number
  cancel: TaskCancelMeta
}): Task | undefined => {
  markTaskCanceled(params.runtime.domain.tasks, params.taskId, {
    completedAt: params.completedAt,
    ...(params.durationMs !== undefined
      ? { durationMs: params.durationMs }
      : {}),
    cancel: params.cancel,
  })
  return findTask(params.runtime, params.taskId)
}

export const removeRuntimeTask = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
}): Task | undefined => {
  const index = params.runtime.domain.tasks.findIndex(
    (item) => item.id === params.taskId,
  )
  if (index < 0) return undefined
  const [removed] = params.runtime.domain.tasks.splice(index, 1)
  return removed
}

export const recoverDispatchedTaskToPending = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
}): Task | undefined => {
  const task = findTask(params.runtime, params.taskId)
  if (!task) return undefined
  task.status = 'pending'
  delete task.startedAt
  return task
}

export const incrementRuntimeTaskAttempts = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  task?: Task
}): number | undefined => {
  const task = resolveTaskTarget(params)
  if (!task) return undefined
  task.attempts = Math.max(0, (task.attempts ?? 0) + 1)
  return task.attempts
}

export const patchRuntimeTask = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  patch: Partial<Task>
}): Task | undefined => {
  const task = findTask(params.runtime, params.taskId)
  if (!task) return undefined
  Object.assign(task, params.patch)
  return task
}

export const applyRuntimeTaskGitResult = (params: {
  runtime: RuntimeTaskStateSlice
  taskId: string
  git: TaskGitExecution
  result?: TaskResult
}): Task | undefined => {
  const task = findTask(params.runtime, params.taskId)
  if (!task) return undefined
  task.git = params.git
  if (params.result) task.result = params.result
  return task
}

export const applyRuntimeTaskDomainWrite = (
  params:
    | {
        kind: 'assign_usage'
        runtime: RuntimeTaskStateSlice
        taskId: string
        usage: NonNullable<Task['usage']>
        task?: Task
      }
    | {
        kind: 'mark_running'
        runtime: RuntimeTaskStateSlice
        taskId: string
        startedAt?: string
      }
    | {
        kind: 'apply_result'
        runtime: RuntimeTaskFocusStateSlice
        taskId: string
        result: TaskResult
        markTask: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void
        patch: Partial<Task>
      },
): Task | undefined => {
  if (params.kind === 'assign_usage') {
    const task = resolveTaskTarget(params)
    if (!task) return undefined
    task.usage = params.usage
    return task
  }

  if (params.kind === 'mark_running') {
    markTaskRunning(params.runtime.domain.tasks, params.taskId, {
      ...(params.startedAt ? { startedAt: params.startedAt } : {}),
    })
    return findTask(params.runtime, params.taskId)
  }

  params.markTask(params.runtime.domain.tasks, params.taskId, params.patch)
  const task = findTask(params.runtime, params.taskId)
  if (!task) return undefined
  syncFocusFromTaskResult(params.runtime, task, params.result)
  return task
}
