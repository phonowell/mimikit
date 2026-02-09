import { appendLog } from '../../../log/append.js'
import { bestEffort } from '../../../log/safe.js'
import { markTaskRunning } from '../../../tasks/queue.js'
import { persistRuntimeState } from '../../core/runtime-persistence.js'
import { notifyWorkerLoop } from '../../core/worker-signal.js'

import { runTask } from './worker-run-task.js'
import { appendRuntimeIssue } from './worker-runtime-feedback.js'

import type { Task } from '../../../types/index.js'
import type { RuntimeState } from '../../core/runtime-state.js'

const reportWorkerQueueError = async (
  runtime: RuntimeState,
  error: unknown,
): Promise<void> => {
  const message = error instanceof Error ? error.message : String(error)
  await bestEffort('appendReportingEvent: worker_queue_error', () =>
    appendRuntimeIssue({
      runtime,
      severity: 'high',
      category: 'failure',
      message: `worker queue error: ${message}`,
      note: 'worker_queue_error',
    }),
  )
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
