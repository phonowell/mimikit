import { isSameUsage } from '../../execution/shared/token-usage.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
  notifyWorkerLoop,
} from '../../kernel/orchestrator/signals.js'
import { bestEffort } from '../../persistence/log/safe.js'

import { markTaskRunning } from './task-lifecycle.js'

import type { Task, TokenUsage } from '../../foundation/types/index.js'
import type { OrchestratorRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const updateTaskUsage = (
  runtime: OrchestratorRuntime,
  task: Task,
  usage: TokenUsage,
): boolean => {
  if (isSameUsage(task.usage, usage)) return false
  task.usage = usage
  notifyUiSignal(runtime, 'tasks')
  return true
}

export const startTaskWorkerRun = async (params: {
  runtime: OrchestratorRuntime
  task: Task
  dispatchLockKey: string
  controller: AbortController
}): Promise<void> => {
  const { runtime, task, dispatchLockKey, controller } = params
  runtime.worker.lastActivityAtMs = Date.now()
  runtime.worker.runningTaskLocks.add(dispatchLockKey)
  runtime.worker.runningControllers.set(task.id, controller)
  markTaskRunning(runtime.tasks, task.id)
  notifyUiSignal(runtime)
  await bestEffort('persistRuntimeState: worker_start', () =>
    persistRuntimeState(runtime),
  )
}

export const finishTaskWorkerRun = async (params: {
  runtime: OrchestratorRuntime
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
