import { waitForWorkerLoopSignal } from '../orchestrator/core/signals.js'

import { clearTaskLiveOutput } from './live-output.js'
import { reportWorkerQueueError, runQueuedWorker } from './queued-run.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

export const enqueueWorkerTask = (runtime: RuntimeState, task: Task): void => {
  if (task.status !== 'pending') return
  if (runtime.worker.runningControllers.has(task.id)) return
  if (runtime.worker.queue.sizeBy({ id: task.id }) > 0) return
  void runtime.worker.queue
    .add(() => runQueuedWorker(runtime, task), { id: task.id })
    .catch((error) => reportWorkerQueueError(runtime, error))
}

export const enqueuePendingWorkerTasks = (runtime: RuntimeState): void => {
  for (const task of runtime.tasks) {
    if (
      task.status === 'running' &&
      !runtime.worker.runningControllers.has(task.id) &&
      runtime.worker.queue.sizeBy({ id: task.id }) === 0
    ) {
      task.status = 'pending'
      delete task.startedAt
      clearTaskLiveOutput(runtime, task.id)
    }
    if (task.status !== 'pending') continue
    enqueueWorkerTask(runtime, task)
  }
}

export const workerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.session.stopped) {
    enqueuePendingWorkerTasks(runtime)
    await waitForWorkerLoopSignal(runtime, Number.POSITIVE_INFINITY)
  }

  runtime.worker.queue.pause()
  runtime.worker.queue.clear()
}
