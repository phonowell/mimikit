import { appendLog } from '../log/append.js'
import {
  markTaskCanceled,
  markTaskFailed,
  markTaskSucceeded,
} from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'

import { buildResult, finalizeResult } from './result-finalize.js'
import { runTaskWithRetry } from './run-retry.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

export const runTask = async (
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
    const llmResult = await runTaskWithRetry({ runtime, task, controller })
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
    notifyWorkerLoop(runtime)
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
    notifyWorkerLoop(runtime)
  }
}
