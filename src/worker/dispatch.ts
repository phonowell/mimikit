import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  notifyManagerLoop,
  notifyUiSignal,
  notifyWorkerLoop,
  waitForWorkerLoopSignal,
} from '../orchestrator/core/signals.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskPaused,
  markTaskRunning,
  markTaskSucceeded,
} from '../orchestrator/core/task-lifecycle.js'
import { requestTaskResumeChoice } from '../orchestrator/core/task-resume-choice.js'
import { buildTaskDispatchLockKey } from '../shared/task-execution-target.js'
import { isSameUsage } from '../shared/token-usage.js'

import { clearTaskLiveOutput, setTaskLiveOutput } from './live-output.js'
import { isWorkerBudgetExceededError } from './profiled-runner-loop.js'
import { buildResult, finalizeResult } from './result-finalize.js'
import { runTaskWithRetry } from './run-retry.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

const LONG_TASK_SOFT_THRESHOLD_MS = 20 * 60 * 1000

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
        if (isSameUsage(task.usage, usage)) return
        task.usage = usage
        notifyUiSignal(runtime, 'tasks')
      },
      onPartialOutput: (output) => {
        if (!setTaskLiveOutput(runtime, task.id, output)) return
        notifyUiSignal(runtime, 'tasks')
      },
    })
    if (task.status === 'paused') return
    if (task.status === 'canceled') {
      const usage = llmResult.usage ?? task.usage
      const result = buildResult(
        task,
        'canceled',
        'Task canceled',
        elapsed(),
        usage,
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
    if (task.status === 'paused') return
    if (isWorkerBudgetExceededError(error)) {
      const partialOutput = error.latestOutput.trim()
      const result = buildResult(
        task,
        'partial',
        partialOutput,
        error.elapsedMs,
        error.usage ?? task.usage,
      )
      result.handoff = {
        ...(result.handoff ?? {}),
        summary:
          partialOutput.length > 0
            ? `Task paused after hitting the run budget. ${partialOutput.split(/\r?\n/, 1)[0]?.trim() ?? ''}`.trim()
            : 'Task paused after hitting the run budget.',
        nextSteps: [
          'Review the partial result and resume the task when you want to continue.',
        ],
        risks: [
          'Task stopped at the run budget boundary and may need another resume cycle.',
        ],
      }
      await finalizeResult(runtime, task, result, markTaskPaused, {
        taskPatch: {
          pausedAt: result.completedAt,
        },
        persistCompletionFields: false,
      })
      await bestEffort('requestTaskResumeChoice: budget_pause', async () => {
        await requestTaskResumeChoice({
          runtime,
          task,
          createdAt: result.completedAt,
        })
        await persistRuntimeState(runtime)
      })
      return
    }
    if (task.status === 'canceled') {
      const { usage } = task
      const result = buildResult(
        task,
        'canceled',
        err.message || 'Task canceled',
        elapsed(),
        usage,
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
