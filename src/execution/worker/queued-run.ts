import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'
import {
  finishTaskWorkerRun,
  startTaskWorkerRun,
} from '../../work/orchestrator/task-worker-run-write.js'
import { buildTaskDispatchLockKey } from '../../work/shared/task-execution-target.js'

import { clearTaskLiveOutput } from './live-output.js'
import { runTask } from './run-task.js'

import type { Task } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const LONG_TASK_SOFT_THRESHOLD_MS = 20 * 60 * 1000

export const reportWorkerQueueError = async (
  runtime: WorkerRuntime,
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
  runtime: WorkerRuntime,
  task: Task,
): Promise<void> => {
  if (task.status !== 'pending') return
  if (runtime.worker.runningControllers.has(task.id)) return
  const dispatchLockKey = buildTaskDispatchLockKey(task)
  if (dispatchLockKey && runtime.worker.runningTaskLocks.has(dispatchLockKey))
    return
  clearTaskLiveOutput(runtime, task.id)
  const controller = new AbortController()
  await startTaskWorkerRun({
    runtime,
    task,
    dispatchLockKey,
    controller,
  })
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
    await finishTaskWorkerRun({
      runtime,
      taskId: task.id,
      dispatchLockKey,
    })
  }
}
