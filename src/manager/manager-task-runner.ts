import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import {
  markTaskFailed,
  markTaskRunning,
  markTaskSucceeded,
} from '../orchestrator/core/task-state.js'
import { buildResult, finalizeResult } from '../worker/result-finalize.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task } from '../types/index.js'

const runManagerProfileTask = async (
  runtime: RuntimeState,
  task: Task,
): Promise<void> => {
  const startedAt = Date.now()
  const elapsed = () => Math.max(0, Date.now() - startedAt)

  markTaskRunning(runtime.tasks, task.id)
  await bestEffort('persistRuntimeState: manager_task_start', () =>
    persistRuntimeState(runtime),
  )

  await bestEffort('appendLog: manager_task_start', () =>
    appendLog(runtime.paths.log, {
      event: 'manager_task_start',
      taskId: task.id,
      profile: 'manager',
      promptChars: task.prompt.length,
    }),
  )

  try {
    const result = buildResult(task, 'succeeded', task.prompt, elapsed())
    await finalizeResult(runtime, task, result, markTaskSucceeded)
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    const result = buildResult(task, 'failed', err.message, elapsed())
    await finalizeResult(runtime, task, result, markTaskFailed)
  }

  await bestEffort('appendLog: manager_task_end', () =>
    appendLog(runtime.paths.log, {
      event: 'manager_task_end',
      taskId: task.id,
      profile: 'manager',
      status: task.status,
      elapsedMs: elapsed(),
    }),
  )
}

export const executeManagerProfileTasks = async (
  runtime: RuntimeState,
): Promise<void> => {
  const pending = runtime.tasks.filter(
    (t) => t.profile === 'manager' && t.status === 'pending',
  )
  for (const task of pending) {
    if (runtime.stopped) break
    await runManagerProfileTask(runtime, task)
  }
}
