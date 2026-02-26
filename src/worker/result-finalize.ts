import { appendLog } from '../log/append.js'
import { bestEffort, safeOrUndefined } from '../log/safe.js'
import { notifyManagerLoop } from '../orchestrator/core/signals.js'
import { nowIso } from '../shared/utils.js'
import { appendTaskProgress } from '../storage/task-progress.js'
import { appendTaskResultArchive } from '../storage/task-results.js'
import { publishWorkerResult } from '../streams/queues.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { Task, TaskResult, TokenUsage } from '../types/index.js'

export const archiveTaskResult = (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  source: 'worker' | 'cancel',
): Promise<string | undefined> =>
  safeOrUndefined(`appendTaskResultArchive: ${source}`, () =>
    appendTaskResultArchive(runtime.config.workDir, {
      taskId: task.id,
      title: task.title,
      status: result.status,
      prompt: task.prompt,
      output: result.output,
      createdAt: task.createdAt,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(result.cancel ? { cancel: result.cancel } : {}),
    }),
  )

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
  profile: task.profile,
  ...(status === 'canceled'
    ? { cancel: task.cancel ?? { source: 'system' } }
    : {}),
})

export const finalizeResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  markFn: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void,
): Promise<void> => {
  runtime.lastWorkerActivityAtMs = Date.now()
  const archivePath = await archiveTaskResult(runtime, task, result, 'worker')
  if (archivePath) result.archivePath = archivePath
  markFn(runtime.tasks, task.id, {
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(archivePath ? { archivePath } : {}),
  })
  await bestEffort('appendTaskProgress: worker_end', () =>
    appendTaskProgress({
      stateDir: runtime.config.workDir,
      taskId: task.id,
      type: 'worker_end',
      payload: {
        status: result.status,
        durationMs: result.durationMs,
        ...(result.cancel ? { cancel: result.cancel } : {}),
        ...(archivePath ? { archivePath } : {}),
      },
    }),
  )
  await publishWorkerResult({
    paths: runtime.paths,
    payload: result,
  })
  notifyManagerLoop(runtime)
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
