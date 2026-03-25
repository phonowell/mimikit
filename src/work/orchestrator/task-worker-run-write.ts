import { isSameUsage } from '../../execution/shared/token-usage.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
  notifyWorkerLoop,
} from '../../kernel/orchestrator/signals.js'
import { bestEffort } from '../../persistence/log/safe.js'

import {
  assignRuntimeTaskUsage,
  markRuntimeTaskRunning,
} from './task-state-write.js'

import type { Task, TokenUsage } from '../../foundation/types/index.js'
import type {
  RuntimeManagerState,
  RuntimePersistState,
  RuntimeUiState,
  RuntimeWorkerState,
} from '../../kernel/orchestrator/runtime-interfaces.js'

type TaskWorkerRunRuntime = RuntimePersistState & {
  manager: RuntimePersistState['manager'] &
    Pick<RuntimeManagerState, 'wakePending' | 'signalController'>
  worker: Pick<
    RuntimeWorkerState,
    | 'lastActivityAtMs'
    | 'runningControllers'
    | 'runningTaskLocks'
    | 'signalController'
  >
  ui: RuntimePersistState['ui'] &
    Pick<RuntimeUiState, 'wakeVersion' | 'wakeEvents' | 'signalControllers'>
}

export const updateTaskUsage = (
  runtime: TaskWorkerRunRuntime,
  task: Task,
  usage: TokenUsage,
): boolean => {
  if (isSameUsage(task.usage, usage)) return false
  assignRuntimeTaskUsage({
    runtime,
    taskId: task.id,
    task,
    usage,
  })
  notifyUiSignal(runtime, 'tasks')
  return true
}

export const startTaskWorkerRun = async (params: {
  runtime: TaskWorkerRunRuntime
  task: Task
  dispatchLockKey: string
  controller: AbortController
}): Promise<void> => {
  const { runtime, task, dispatchLockKey, controller } = params
  runtime.worker.lastActivityAtMs = Date.now()
  runtime.worker.runningTaskLocks.add(dispatchLockKey)
  runtime.worker.runningControllers.set(task.id, controller)
  markRuntimeTaskRunning({ runtime, taskId: task.id })
  notifyUiSignal(runtime)
  await bestEffort('persistRuntimeState: worker_start', () =>
    persistRuntimeState(runtime),
  )
}

export const finishTaskWorkerRun = async (params: {
  runtime: TaskWorkerRunRuntime
  taskId: string
  dispatchLockKey: string
}): Promise<void> => {
  const { runtime, taskId, dispatchLockKey } = params
  runtime.worker.runningControllers.delete(taskId)
  runtime.worker.runningTaskLocks.delete(dispatchLockKey)
  notifyManagerLoop(runtime)
  await bestEffort('persistRuntimeState: worker_end', () =>
    persistRuntimeState(runtime),
  )
  notifyWorkerLoop(runtime)
}
