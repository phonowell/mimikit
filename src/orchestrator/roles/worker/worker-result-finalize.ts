import { appendLog } from '../../../log/append.js'
import { bestEffort } from '../../../log/safe.js'
import { nowIso } from '../../../shared/utils.js'
import { publishWorkerResult } from '../../../streams/channels.js'

import { archiveTaskResult } from './worker-result-archive.js'

import type { Task, TaskResult, TokenUsage } from '../../../types/index.js'
import type { RuntimeState } from '../../core/runtime-state.js'

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
})

export const finalizeResult = async (
  runtime: RuntimeState,
  task: Task,
  result: TaskResult,
  markFn: (tasks: Task[], taskId: string, patch?: Partial<Task>) => void,
): Promise<void> => {
  const archivePath = await archiveTaskResult(runtime, task, result, 'worker')
  if (archivePath) result.archivePath = archivePath
  markFn(runtime.tasks, task.id, {
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.usage ? { usage: result.usage } : {}),
    ...(archivePath ? { archivePath } : {}),
  })
  await publishWorkerResult({
    paths: runtime.paths,
    payload: result,
  })
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
