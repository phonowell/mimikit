import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { markTaskRunning } from '../orchestrator/core/task-state.js'
import {
  notifyWorkerLoop,
  waitForWorkerLoopSignal,
} from '../orchestrator/core/worker-signal.js'

import { runTask } from './run-task.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

const reportWorkerQueueError = async (
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

const runQueuedWorker = async (
  runtime: RuntimeState,
  task: Task,
): Promise<void> => {
  if (task.status !== 'pending') return
  if (runtime.runningControllers.has(task.id)) return
  const controller = new AbortController()
  runtime.runningControllers.set(task.id, controller)
  markTaskRunning(runtime.tasks, task.id)
  await bestEffort('persistRuntimeState: worker_start', () =>
    persistRuntimeState(runtime),
  )
  try {
    await runTask(runtime, task, controller)
  } finally {
    runtime.runningControllers.delete(task.id)
    await bestEffort('persistRuntimeState: worker_end', () =>
      persistRuntimeState(runtime),
    )
    notifyWorkerLoop(runtime)
  }
}

export const enqueueWorkerTask = (runtime: RuntimeState, task: Task): void => {
  if (task.status !== 'pending') return
  if (runtime.runningControllers.has(task.id)) return
  if (runtime.workerQueue.sizeBy({ id: task.id }) > 0) return
  void runtime.workerQueue
    .add(() => runQueuedWorker(runtime, task), { id: task.id })
    .catch((error) => reportWorkerQueueError(runtime, error))
}

export const enqueuePendingWorkerTasks = (runtime: RuntimeState): void => {
  for (const task of runtime.tasks) {
    if (task.status !== 'pending') continue
    enqueueWorkerTask(runtime, task)
  }
}

export const workerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    enqueuePendingWorkerTasks(runtime)
    await waitForWorkerLoopSignal(runtime, Number.POSITIVE_INFINITY)
  }

  runtime.workerQueue.pause()
  runtime.workerQueue.clear()
}
