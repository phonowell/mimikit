import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { runWorker } from '../roles/runner.js'
import { sleep } from '../shared/utils.js'
import { appendTaskResultArchive } from '../storage/task-results.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskRunning,
  markTaskSucceeded,
  pickNextPendingTask,
} from '../tasks/queue.js'
import { nowIso } from '../time.js'

import type { RuntimeState } from './runtime.js'
import type { Task, TaskResult } from '../types/tasks.js'

const runTask = async (
  runtime: RuntimeState,
  task: Task,
  controller: AbortController,
): Promise<void> => {
  const startedAt = Date.now()
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
      abortSignal: controller.signal,
    })
    if (task.status === 'canceled') {
      const completedAt = nowIso()
      const result: TaskResult = {
        taskId: task.id,
        status: 'canceled',
        ok: false,
        output: 'Task canceled',
        durationMs: Math.max(0, Date.now() - startedAt),
        completedAt,
        ...(task.title ? { title: task.title } : {}),
        ...(llmResult.usage ? { usage: llmResult.usage } : {}),
      }
      const archivePath = await safe(
        'appendTaskResultArchive: worker',
        () =>
          appendTaskResultArchive(runtime.config.stateDir, {
            taskId: task.id,
            title: task.title,
            status: result.status,
            prompt: task.prompt,
            output: result.output,
            createdAt: task.createdAt,
            completedAt,
            durationMs: result.durationMs,
            ...(result.usage ? { usage: result.usage } : {}),
          }),
        { fallback: undefined },
      )
      if (archivePath) result.archivePath = archivePath
      markTaskCanceled(runtime.tasks, task.id)
      runtime.pendingResults.push(result)
      await appendLog(runtime.paths.log, {
        event: 'worker_end',
        taskId: task.id,
        status: result.status,
        durationMs: result.durationMs,
        elapsedMs: result.durationMs,
        ...(llmResult.usage ? { usage: llmResult.usage } : {}),
        ...(archivePath ? { archivePath } : {}),
      })
      return
    }
    const completedAt = nowIso()
    const result: TaskResult = {
      taskId: task.id,
      status: 'succeeded',
      ok: true,
      output: llmResult.output,
      durationMs: Math.max(0, Date.now() - startedAt),
      completedAt,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
      ...(task.title ? { title: task.title } : {}),
    }
    const archivePath = await safe(
      'appendTaskResultArchive: worker',
      () =>
        appendTaskResultArchive(runtime.config.stateDir, {
          taskId: task.id,
          title: task.title,
          status: result.status,
          prompt: task.prompt,
          output: result.output,
          createdAt: task.createdAt,
          completedAt,
          durationMs: result.durationMs,
          ...(result.usage ? { usage: result.usage } : {}),
        }),
      { fallback: undefined },
    )
    if (archivePath) result.archivePath = archivePath
    markTaskSucceeded(runtime.tasks, task.id)
    runtime.pendingResults.push(result)
    await appendLog(runtime.paths.log, {
      event: 'worker_end',
      taskId: task.id,
      status: result.status,
      durationMs: result.durationMs,
      elapsedMs: result.durationMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
      ...(archivePath ? { archivePath } : {}),
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const isCanceled = task.status === 'canceled'
    if (isCanceled) {
      const completedAt = nowIso()
      const result: TaskResult = {
        taskId: task.id,
        status: 'canceled',
        ok: false,
        output: err.message || 'Task canceled',
        durationMs: Math.max(0, Date.now() - startedAt),
        completedAt,
        ...(task.title ? { title: task.title } : {}),
      }
      const archivePath = await safe(
        'appendTaskResultArchive: worker',
        () =>
          appendTaskResultArchive(runtime.config.stateDir, {
            taskId: task.id,
            title: task.title,
            status: result.status,
            prompt: task.prompt,
            output: result.output,
            createdAt: task.createdAt,
            completedAt,
            durationMs: result.durationMs,
          }),
        { fallback: undefined },
      )
      if (archivePath) result.archivePath = archivePath
      markTaskCanceled(runtime.tasks, task.id)
      runtime.pendingResults.push(result)
      await safe(
        'appendLog: worker_end',
        () =>
          appendLog(runtime.paths.log, {
            event: 'worker_end',
            taskId: task.id,
            status: 'canceled',
            taskStatus: result.status,
            error: err.message,
            durationMs: result.durationMs,
            elapsedMs: result.durationMs,
            ...(archivePath ? { archivePath } : {}),
          }),
        { fallback: undefined },
      )
      return
    }
    const isTimeout =
      err.name === 'AbortError' || /timed out|timeout/i.test(err.message)
    const status = isTimeout ? 'timeout' : 'error'
    const completedAt = nowIso()
    const result: TaskResult = {
      taskId: task.id,
      status: 'failed',
      ok: false,
      output: err.message,
      durationMs: Math.max(0, Date.now() - startedAt),
      completedAt,
      ...(task.title ? { title: task.title } : {}),
    }
    const archivePath = await safe(
      'appendTaskResultArchive: worker',
      () =>
        appendTaskResultArchive(runtime.config.stateDir, {
          taskId: task.id,
          title: task.title,
          status: result.status,
          prompt: task.prompt,
          output: result.output,
          createdAt: task.createdAt,
          completedAt,
          durationMs: result.durationMs,
        }),
      { fallback: undefined },
    )
    if (archivePath) result.archivePath = archivePath
    markTaskFailed(runtime.tasks, task.id)
    runtime.pendingResults.push(result)
    await safe(
      'appendLog: worker_end',
      () =>
        appendLog(runtime.paths.log, {
          event: 'worker_end',
          taskId: task.id,
          status,
          taskStatus: result.status,
          error: err.message,
          durationMs: result.durationMs,
          elapsedMs: result.durationMs,
          ...(archivePath ? { archivePath } : {}),
        }),
      { fallback: undefined },
    )
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
      await safe(
        'appendLog: worker_loop_error',
        () =>
          appendLog(runtime.paths.log, {
            event: 'worker_loop_error',
            error: error instanceof Error ? error.message : String(error),
          }),
        { fallback: undefined },
      )
    }
    await sleep(1000)
  }
}
