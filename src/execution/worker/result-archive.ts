import { safeOrUndefined } from '../../persistence/log/safe.js'
import {
  resolveTaskResultArchivePath,
  writeTaskResultArchiveAtPath,
} from '../../persistence/storage/task-results.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const buildArchiveEntry = (task: Task, result: TaskResult) => ({
  taskId: task.id,
  focusId: task.focusId,
  title: task.title,
  status: result.status,
  provider: task.provider,
  prompt: task.prompt,
  output: result.output,
  createdAt: task.createdAt,
  completedAt: result.completedAt,
  durationMs: result.durationMs,
  ...(result.taskStatus ? { taskStatus: result.taskStatus } : {}),
  ...(result.outcome ? { outcome: result.outcome } : {}),
  ...(result.stopReason ? { stopReason: result.stopReason } : {}),
  ...(result.usage ? { usage: result.usage } : {}),
  ...(result.cancel ? { cancel: result.cancel } : {}),
  ...(result.handoff ? { handoff: result.handoff } : {}),
  ...(result.evidence ? { evidence: result.evidence } : {}),
})

export const resolveArchivePath = (
  runtime: WorkerRuntime,
  task: Task,
  result: TaskResult,
  source: 'worker' | 'cancel',
): Promise<string | undefined> =>
  safeOrUndefined(`appendTaskResultArchive: ${source}`, () =>
    resolveTaskResultArchivePath(
      runtime.config.workDir,
      buildArchiveEntry(task, result),
    ),
  )

export const writeTaskArchive = (
  task: Task,
  result: TaskResult,
  archivePath: string,
  source: 'worker' | 'cancel',
): Promise<string | undefined> =>
  safeOrUndefined(`writeTaskResultArchive: ${source}`, async () => {
    await writeTaskResultArchiveAtPath(
      archivePath,
      buildArchiveEntry(task, result),
    )
    return archivePath
  })
