import { appendLog } from '../log/append.js'
import { bestEffort, safeOrUndefined } from '../log/safe.js'
import { runWorker } from '../roles/worker-runner.js'
import { nowIso, sleep } from '../shared/utils.js'
import { appendTaskResultArchive } from '../storage/task-results.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskRunning,
  markTaskSucceeded,
  pickNextPendingTask,
} from '../tasks/queue.js'

import type { RuntimeState } from './runtime.js'
import type { Task, TaskResult, TokenUsage } from '../types/index.js'

const buildResult = (
  task: Task,
  status: TaskResult['status'],
  output: string,
  durationMs: number,
  usage?: TokenUsage,
): TaskResult => ({
  taskId: task.id,
  status,
  ok: status === 'succeeded',
  output,
  durationMs,
  completedAt: nowIso(),
  ...(usage ? { usage } : {}),
  ...(task.title ? { title: task.title } : {}),
})

const archiveResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
): Promise<string | undefined> =>
  safeOrUndefined('appendTaskResultArchive: worker', () =>
    appendTaskResultArchive(runtime.config.stateDir, {
      taskId: task.id,
      title: task.title,
      status: result.status,
      prompt: task.prompt,
      output: result.output,
      createdAt: task.createdAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
    }),
  )

const finalizeResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  markFn: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void,
) => {
  const archivePath = await archiveResult(runtime, task, result)
  if (archivePath) result.archivePath = archivePath
  markFn(runtime.tasks, task.id, {
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(archivePath ? { archivePath } : {}),
  })
  runtime.pendingResults.push(result)
  await bestEffort('appendLog: worker_end', () =>
    appendLog(runtime.paths.log, {
      event: 'worker_end',
      taskId: task.id,
      status: result.status,
      durationMs: result.durationMs,
      elapsedMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(archivePath ? { archivePath } : {}),
    }),
  )
}

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
      promptChars: task.prompt.length,
    })
    const llmResult = await runWorker({
      stateDir: runtime.config.stateDir,
      workDir: runtime.config.workDir,
      task,
      timeoutMs: runtime.config.worker.timeoutMs,
      ...(runtime.config.worker.model
        ? { model: runtime.config.worker.model }
        : {}),
      abortSignal: controller.signal,
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

const spawnWorker = async (runtime: RuntimeState, task: Task) => {
  if (task.status !== 'pending') return
  if (runtime.runningWorkers.has(task.id)) return
  runtime.runningWorkers.add(task.id)
  const controller = new AbortController()
  runtime.runningControllers.set(task.id, controller)
  markTaskRunning(runtime.tasks, task.id)
  try {
    await runTask(runtime, task, controller)
  } finally {
    runtime.runningWorkers.delete(task.id)
    runtime.runningControllers.delete(task.id)
  }
}

export const workerLoop = async (runtime: RuntimeState): Promise<void> => {
  while (!runtime.stopped) {
    try {
      if (runtime.runningWorkers.size < runtime.config.worker.maxConcurrent) {
        const next = pickNextPendingTask(runtime.tasks, runtime.runningWorkers)
        if (next) void spawnWorker(runtime, next)
      }
    } catch (error) {
      await bestEffort('appendLog: worker_loop_error', () =>
        appendLog(runtime.paths.log, {
          event: 'worker_loop_error',
          error: error instanceof Error ? error.message : String(error),
        }),
      )
    }
    await sleep(1000)
  }
}
