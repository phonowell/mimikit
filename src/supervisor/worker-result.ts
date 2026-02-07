import { appendLog } from '../log/append.js'
import { bestEffort, safeOrUndefined } from '../log/safe.js'
import { nowIso } from '../shared/utils.js'
import { appendTaskResultArchive } from '../storage/task-results.js'

import type { RuntimeState } from './runtime.js'
import type { Task, TaskResult, TokenUsage } from '../types/index.js'

export const buildResult = (
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

export const finalizeResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  markFn: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void,
): Promise<void> => {
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
