import { safeOrUndefined } from '../log/safe.js'
import { appendReportingEvent } from '../reporting/events.js'
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

export const appendRuntimeIssue = (params: {
  runtime: RuntimeState
  message: string
  severity: 'low' | 'medium' | 'high'
  category: 'quality' | 'latency' | 'cost' | 'failure' | 'ux' | 'other'
  note: string
  task?: Task
  elapsedMs?: number
  usageTotal?: number
}): Promise<void> =>
  appendReportingEvent({
    stateDir: params.runtime.config.stateDir,
    source: 'runtime',
    category: params.category,
    severity: params.severity,
    message: params.message,
    note: params.note,
    ...(params.task ? { taskId: params.task.id } : {}),
    ...(params.elapsedMs !== undefined ? { elapsedMs: params.elapsedMs } : {}),
    ...(params.usageTotal !== undefined
      ? { usageTotal: params.usageTotal }
      : {}),
  }).then(() => undefined)
