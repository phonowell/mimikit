import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { runWorker } from '../roles/runner.js'
import { sleep } from '../shared/utils.js'
import { markTaskDone, pickNextPendingTask } from '../tasks/queue.js'
import { nowIso } from '../time.js'

import type { RuntimeState } from './runtime.js'
import type { Task, TaskResult } from '../types/tasks.js'

const runTask = async (runtime: RuntimeState, task: Task): Promise<void> => {
  const startedAt = Date.now()
  try {
    await appendLog(runtime.paths.log, {
      event: 'worker_start',
      taskId: task.id,
      promptChars: task.prompt.length,
    })
    const llmResult = await runWorker({
      workDir: runtime.config.workDir,
      task,
      timeoutMs: runtime.config.worker.timeoutMs,
    })
    const result: TaskResult = {
      taskId: task.id,
      status: 'done',
      ok: true,
      output: llmResult.output,
      durationMs: Math.max(0, Date.now() - startedAt),
      completedAt: nowIso(),
    }
    markTaskDone(runtime.tasks, task.id)
    runtime.pendingResults.push(result)
    await appendLog(runtime.paths.log, {
      event: 'worker_end',
      taskId: task.id,
      status: 'done',
      durationMs: result.durationMs,
      elapsedMs: result.durationMs,
      ...(llmResult.usage ? { usage: llmResult.usage } : {}),
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const isTimeout =
      err.name === 'AbortError' || /timed out|timeout/i.test(err.message)
    const status = isTimeout ? 'timeout' : 'error'
    const result: TaskResult = {
      taskId: task.id,
      status: 'done',
      ok: false,
      output: err.message,
      durationMs: Math.max(0, Date.now() - startedAt),
      completedAt: nowIso(),
    }
    markTaskDone(runtime.tasks, task.id)
    runtime.pendingResults.push(result)
    await safe(
      'appendLog: worker_end',
      () =>
        appendLog(runtime.paths.log, {
          event: 'worker_end',
          taskId: task.id,
          status,
          error: err.message,
          durationMs: result.durationMs,
          elapsedMs: result.durationMs,
        }),
      { fallback: undefined },
    )
  }
}

const spawnWorker = async (runtime: RuntimeState, task: Task) => {
  if (runtime.runningWorkers.has(task.id)) return
  runtime.runningWorkers.add(task.id)
  try {
    await runTask(runtime, task)
  } finally {
    runtime.runningWorkers.delete(task.id)
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
