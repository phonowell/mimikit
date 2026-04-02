import { isSameUsage } from '../../execution/shared/token-usage.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
  notifyWorkerLoop,
} from '../../kernel/orchestrator/signals.js'
import { bestEffort } from '../../persistence/log/safe.js'

import { applyRuntimeTaskDomainWrite } from './task-state-write.js'

import type { Task, TokenUsage } from '../../foundation/types/index.js'
import type {
  RuntimeManagerState,
  RuntimePersistState,
  RuntimeUiState,
  RuntimeWorkerState,
} from '../../kernel/orchestrator/runtime-interfaces.js'

type TaskWorkerRunRuntime = RuntimePersistState & {
  process: RuntimePersistState['process'] & {
    manager: RuntimePersistState['process']['manager'] &
      Pick<RuntimeManagerState, 'wakePending' | 'signalController'>
    worker: Pick<
      RuntimeWorkerState,
      | 'lastActivityAtMs'
      | 'runningControllers'
      | 'runningTaskLocks'
      | 'signalController'
    >
    ui: RuntimePersistState['process']['ui'] &
      Pick<RuntimeUiState, 'wakeVersion' | 'wakeEvents' | 'signalControllers'>
  }
}

export const updateTaskUsage = (
  runtime: TaskWorkerRunRuntime,
  task: Task,
  usage: TokenUsage,
): boolean => {
  if (isSameUsage(task.usage, usage)) return false
  applyRuntimeTaskDomainWrite({
    kind: 'assign_usage',
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
  dispatchLockKey: string | undefined
  controller: AbortController
}): Promise<void> => {
  const { runtime, task, dispatchLockKey, controller } = params
  runtime.process.worker.lastActivityAtMs = Date.now()
  if (dispatchLockKey)
    runtime.process.worker.runningTaskLocks.add(dispatchLockKey)
  runtime.process.worker.runningControllers.set(task.id, controller)
  applyRuntimeTaskDomainWrite({
    kind: 'mark_running',
    runtime,
    taskId: task.id,
  })
  notifyUiSignal(runtime)
  await bestEffort('persistRuntimeState: worker_start', () =>
    persistRuntimeState(runtime),
  )
}

export const finishTaskWorkerRun = async (params: {
  runtime: TaskWorkerRunRuntime
  taskId: string
  dispatchLockKey: string | undefined
}): Promise<void> => {
  const { runtime, taskId, dispatchLockKey } = params
  runtime.process.worker.runningControllers.delete(taskId)
  if (dispatchLockKey)
    runtime.process.worker.runningTaskLocks.delete(dispatchLockKey)
  notifyManagerLoop(runtime)
  await bestEffort('persistRuntimeState: worker_end', () =>
    persistRuntimeState(runtime),
  )
  notifyWorkerLoop(runtime)
}
