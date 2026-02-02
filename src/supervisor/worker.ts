import { appendLog } from '../log/append.js'
import { safe } from '../log/safe.js'
import { runWorker } from '../roles/runner.js'
import { sleep } from '../shared/sleep.js'
import { writeTaskResult } from '../storage/task-results.js'
import { listTasks, updateTask } from '../storage/tasks.js'
import { pickNextTask } from '../tasks/pick.js'
import { nowIso } from '../time.js'

import type { RuntimeState } from './runtime.js'
import type { Task, TaskResult } from '../types/tasks.js'

const markRunning = async (
  runtime: RuntimeState,
  task: Task,
): Promise<Task | null> => {
  const updated = await updateTask(
    runtime.paths.agentQueue,
    task.id,
    (current) => {
      if (current.status !== 'queued') return current
      return { ...current, status: 'running' }
    },
  )
  if (updated?.status !== 'running') return null
  return updated
}

const finalizeTask = async (
  runtime: RuntimeState,
  taskId: string,
  result: TaskResult,
): Promise<void> => {
  await updateTask(runtime.paths.agentQueue, taskId, (current) => ({
    ...current,
    status: result.status === 'done' ? 'done' : result.status,
  }))
  await writeTaskResult(runtime.paths.agentResults, result)
}

const runTask = async (runtime: RuntimeState, task: Task): Promise<void> => {
  const startedAt = Date.now()
  let running: Task | null = null
  try {
    running = await markRunning(runtime, task)
    if (!running) return
    const llmResult = await runWorker({
      workDir: runtime.config.workDir,
      task: running,
      timeoutMs: runtime.config.worker.timeoutMs,
    })
    const result: TaskResult = {
      taskId: running.id,
      status: 'done',
      output: llmResult.output,
      durationMs: Math.max(0, Date.now() - startedAt),
      completedAt: nowIso(),
    }
    await finalizeTask(runtime, running.id, result)
    await appendLog(runtime.paths.log, {
      event: 'worker_done',
      taskId: running.id,
      durationMs: result.durationMs,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    const isTimeout =
      err.name === 'AbortError' || /timed out|timeout/i.test(err.message)
    const status = isTimeout ? 'timeout' : 'failed'
    const result: TaskResult = {
      taskId: running?.id ?? task.id,
      status,
      output: err.message,
      durationMs: Math.max(0, Date.now() - startedAt),
      completedAt: nowIso(),
    }
    await finalizeTask(runtime, running?.id ?? task.id, result)
    await safe(
      'appendLog: worker_error',
      () =>
        appendLog(runtime.paths.log, {
          event: 'worker_error',
          taskId: task.id,
          error: err.message,
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
        const tasks = await listTasks(runtime.paths.agentQueue)
        const next = pickNextTask(tasks, { nowMs: Date.now() })
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
