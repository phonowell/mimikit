import { appendLog } from '../log/append.js'
import {
  enqueueTask,
  markTaskCanceled,
  markTaskFailed,
  markTaskSucceeded,
} from '../orchestrator/core/task-state.js'
import { notifyWorkerLoop } from '../orchestrator/core/worker-signal.js'
import { resolveNextTasks } from '../tasks/chain.js'

import { buildResult, finalizeResult } from './result-finalize.js'
import { runTaskWithRetry } from './run-retry.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

const enqueueNextTasks = (
  runtime: RuntimeState,
  task: Task,
  resultStatus: 'succeeded' | 'failed',
): number => {
  const nextTasks = resolveNextTasks(task, resultStatus)
  if (nextTasks.length === 0) return 0
  let createdCount = 0
  for (const nextDef of nextTasks) {
    const { created } = enqueueTask(
      runtime.tasks,
      nextDef.prompt,
      nextDef.title,
      nextDef.profile ?? task.profile,
    )
    if (!created) continue
    createdCount += 1
  }
  return createdCount
}

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
    const createdCount = enqueueNextTasks(runtime, task, 'succeeded')
    if (createdCount > 0) {
      await appendLog(runtime.paths.log, {
        event: 'worker_chain_enqueued',
        fromTaskId: task.id,
        sourceStatus: 'succeeded',
        createdCount,
      })
    }
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
    const createdCount = enqueueNextTasks(runtime, task, 'failed')
    if (createdCount > 0) {
      await appendLog(runtime.paths.log, {
        event: 'worker_chain_enqueued',
        fromTaskId: task.id,
        sourceStatus: 'failed',
        createdCount,
      })
    }
    notifyWorkerLoop(runtime)
  }
}
