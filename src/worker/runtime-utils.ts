import { safeOrUndefined } from '../log/safe.js'
import { appendTaskResultArchive } from '../storage/task-results.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskResult } from '../types/index.js'

export const archiveTaskResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  source: 'worker' | 'cancel',
): Promise<string | undefined> =>
  safeOrUndefined(`appendTaskResultArchive: ${source}`, () =>
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
