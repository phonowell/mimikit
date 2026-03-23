import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
  notifyWorkerLoop,
} from '../orchestrator/core/signals.js'
import { markTaskRunning } from '../orchestrator/core/task-lifecycle.js'
import { buildTaskDispatchLockKey } from '../shared/task-execution-target.js'

import { clearTaskLiveOutput } from './live-output.js'
import { runTask } from './run-task.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

const LONG_TASK_SOFT_THRESHOLD_MS = 20 * 60 * 1000

export const reportWorkerQueueError = async (
  runtime: RuntimeState,
  error: unknown,
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error)
  await bestEffort('appendLog: worker_queue_error', () =>
    appendLog(runtime.paths.log, {
      event: 'worker_queue_error',
      error: message,
    }),
  )
}

export const runQueuedWorker = async (
  runtime: RuntimeState,
  task: Task,
): Promise<void> => {
  if (task.status !== 'pending') return
  if (runtime.worker.runningControllers.has(task.id)) return
  const dispatchLockKey = buildTaskDispatchLockKey(task)
  if (runtime.worker.runningTaskLocks.has(dispatchLockKey)) return
  runtime.worker.lastActivityAtMs = Date.now()
  clearTaskLiveOutput(runtime, task.id)
  const controller = new AbortController()
  runtime.worker.runningTaskLocks.add(dispatchLockKey)
  runtime.worker.runningControllers.set(task.id, controller)
  markTaskRunning(runtime.tasks, task.id)
  notifyUiSignal(runtime)
  await bestEffort('persistRuntimeState: worker_start', () =>
    persistRuntimeState(runtime),
  )
  let longTaskWarned = false
  const longTaskTimer = setInterval(() => {
    const controllerForTask = runtime.worker.runningControllers.get(task.id)
    if (!controllerForTask || controllerForTask.signal.aborted) return
    const startedAtMs = Date.parse(task.startedAt ?? '')
    if (!Number.isFinite(startedAtMs)) return
    const elapsedMs = Math.max(0, Date.now() - startedAtMs)
    if (elapsedMs < LONG_TASK_SOFT_THRESHOLD_MS) return
    if (longTaskWarned) return
    longTaskWarned = true
    void bestEffort('appendLog: worker_long_task_soft_limit', () =>
      appendLog(runtime.paths.log, {
        event: 'worker_long_task_soft_limit',
        taskId: task.id,
        elapsedMs,
        thresholdMs: LONG_TASK_SOFT_THRESHOLD_MS,
      }),
    )
  }, 10_000)

  try {
    await runTask(runtime, task, controller)
  } finally {
    clearInterval(longTaskTimer)
    clearTaskLiveOutput(runtime, task.id)
    runtime.worker.runningControllers.delete(task.id)
    runtime.worker.runningTaskLocks.delete(dispatchLockKey)
    notifyManagerLoop(runtime)
    await bestEffort('persistRuntimeState: worker_end', () =>
      persistRuntimeState(runtime),
    )
    notifyWorkerLoop(runtime)
  }
}
