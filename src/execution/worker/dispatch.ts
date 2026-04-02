import { waitForWorkerLoopSignal } from '../../kernel/orchestrator/signals.js'
import { recoverDispatchedTaskToPending } from '../../work/orchestrator/task-state-write.js'

import { clearTaskLiveOutput } from './live-output.js'
import { reportWorkerQueueError, runQueuedWorker } from './queued-run.js'

import type { Task } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const enqueueWorkerTask = (runtime: WorkerRuntime, task: Task): void => {
  if (task.status !== 'pending') return
  if (runtime.process.worker.runningControllers.has(task.id)) return
  if (runtime.process.worker.queue.sizeBy({ id: task.id }) > 0) return
  void runtime.process.worker.queue
    .add(() => runQueuedWorker(runtime, task), { id: task.id })
    .catch((error) => reportWorkerQueueError(runtime, error))
}

export const enqueuePendingWorkerTasks = (runtime: WorkerRuntime): void => {
  for (const task of runtime.domain.tasks) {
    if (
      task.status === 'running' &&
      !runtime.process.worker.runningControllers.has(task.id) &&
      runtime.process.worker.queue.sizeBy({ id: task.id }) === 0
    ) {
      recoverDispatchedTaskToPending({ runtime, taskId: task.id })
      clearTaskLiveOutput(runtime, task.id)
    }
    if (task.status !== 'pending') continue
    enqueueWorkerTask(runtime, task)
  }
}

export const workerLoop = async (runtime: WorkerRuntime): Promise<void> => {
  while (!runtime.process.session.stopped) {
    enqueuePendingWorkerTasks(runtime)
    await waitForWorkerLoopSignal(runtime, Number.POSITIVE_INFINITY)
  }

  runtime.process.worker.queue.pause()
  runtime.process.worker.queue.clear()
}
