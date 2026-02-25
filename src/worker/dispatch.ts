import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskRunning,
  markTaskSucceeded,
} from '../orchestrator/core/task-state.js'
import {
  notifyUiSignal,
  notifyWorkerLoop,
  waitForWorkerLoopSignal,
} from '../orchestrator/core/signals.js'

import { buildResult, finalizeResult } from './result-finalize.js'
import { runTaskWithRetry } from './run-retry.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

const runTask = async (
  runtime: RuntimeState,
  task: Task,
  controller: AbortController,
): Promise<void> => {
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)
  try {
    await appendLog(runtime.paths.log, {
      event: 'worker_start',
      taskId: task.id,
      profile: task.profile,
      promptChars: task.prompt.length,
    })
    const llmResult = await runTaskWithRetry({
      runtime,
      task,
      controller,
      onUsage: (usage) => {
        task.usage = usage
        notifyUiSignal(runtime)
      },
    })
    if (task.status === 'canceled') {
      const result = buildResult(
        task,
        'canceled',
        'Task canceled',
        elapsed(),
        llmResult.usage,
      )
      await finalizeResult(runtime, task, result, markTaskCanceled)
      return
    }
    const result = buildResult(
      task,
      'succeeded',
      llmResult.output,
      elapsed(),
      llmResult.usage,
    )
    await finalizeResult(runtime, task, result, markTaskSucceeded)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (task.status === 'canceled') {
      const result = buildResult(
        task,
        'canceled',
        err.message || 'Task canceled',
        elapsed(),
      )
      await finalizeResult(runtime, task, result, markTaskCanceled)
      return
    }
    const result = buildResult(task, 'failed', err.message, elapsed())
    await finalizeResult(runtime, task, result, markTaskFailed)
  }
}

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
  runtime.lastWorkerActivityAtMs = Date.now()
  const controller = new AbortController()
  runtime.runningControllers.set(task.id, controller)
  markTaskRunning(runtime.tasks, task.id)
  notifyUiSignal(runtime)
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
    if (
      task.status === 'running' &&
      !runtime.runningControllers.has(task.id) &&
      runtime.workerQueue.sizeBy({ id: task.id }) === 0
    ) {
      task.status = 'pending'
      delete task.startedAt
    }
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
