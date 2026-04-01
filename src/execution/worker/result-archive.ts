import { safeOrUndefined } from '../../persistence/log/safe.js'
import {
  resolveTaskResultArchivePath,
  writeTaskResultArchiveAtPath,
} from '../../persistence/storage/task-results.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type { WorkerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const buildArchiveEntry = async (
  stateDir: string,
  task: Task,
  result: TaskResult,
) => {
  const spec = await readTaskExecutionSpec(stateDir, task.executionSpecId)
  return {
    taskId: task.id,
    focusId: task.focusId,
    title: task.title,
    status: result.status,
    provider: task.provider,
    prompt: spec.prompt,
    output: result.output,
    createdAt: task.createdAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.taskStatus ? { taskStatus: result.taskStatus } : {}),
    ...(result.outcome ? { outcome: result.outcome } : {}),
    ...(result.stopReason ? { stopReason: result.stopReason } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.traceRef ? { traceRef: result.traceRef } : {}),
    ...(result.providerCallId ? { providerCallId: result.providerCallId } : {}),
    ...(typeof result.attempt === 'number' ? { attempt: result.attempt } : {}),
    ...(result.cancel ? { cancel: result.cancel } : {}),
    ...(result.handoff ? { handoff: result.handoff } : {}),
    ...(result.evidence ? { evidence: result.evidence } : {}),
  }
}

export const resolveArchivePath = (
  runtime: WorkerRuntime,
  task: Task,
  result: TaskResult,
  source: 'worker' | 'cancel',
): Promise<string | undefined> =>
  safeOrUndefined(`appendTaskResultArchive: ${source}`, () =>
    buildArchiveEntry(runtime.config.workDir, task, result).then((entry) =>
      resolveTaskResultArchivePath(runtime.config.workDir, entry),
    ),
  )

export const writeTaskArchive = (
  stateDir: string,
  task: Task,
  result: TaskResult,
  archivePath: string,
  source: 'worker' | 'cancel',
): Promise<string | undefined> =>
  safeOrUndefined(`writeTaskResultArchive: ${source}`, async () => {
    await writeTaskResultArchiveAtPath(
      archivePath,
      await buildArchiveEntry(stateDir, task, result),
    )
    return archivePath
  })
