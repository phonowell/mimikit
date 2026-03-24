import {
  readTaskResultArchive,
  writeTaskResultArchiveAtPath,
} from '../../persistence/storage/task-results.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'

const resolveResultArchivePath = (task: Task): string | undefined => {
  const taskResultPath = task.result?.archivePath?.trim()
  if (taskResultPath) return taskResultPath
  const taskPath = task.archivePath?.trim()
  if (!taskPath) return undefined
  return taskPath
}

export const buildTaskResultWithGitLifecycle = (
  task: Task,
  git: NonNullable<Task['git']>,
): TaskResult | undefined => {
  if (!task.result) return undefined
  return {
    ...task.result,
    handoff: {
      ...(task.result.handoff ?? {}),
      git,
    },
  }
}

export const syncTaskGitLifecycleArtifacts = async (params: {
  task: Task
  git: NonNullable<Task['git']>
  result?: TaskResult | undefined
}): Promise<void> => {
  const archivePath = resolveResultArchivePath(params.task)
  if (!archivePath) return
  const archived = await readTaskResultArchive(archivePath)
  if (!archived) return
  const handoff = {
    ...(archived.handoff ?? params.result?.handoff ?? {}),
    git: params.git,
  }
  await writeTaskResultArchiveAtPath(archivePath, {
    taskId: archived.taskId,
    focusId: params.task.focusId,
    title: params.task.title,
    status: archived.status,
    ...(archived.taskStatus ? { taskStatus: archived.taskStatus } : {}),
    ...(archived.outcome ? { outcome: archived.outcome } : {}),
    ...(archived.stopReason ? { stopReason: archived.stopReason } : {}),
    prompt: params.task.prompt,
    output: archived.output,
    createdAt: params.task.createdAt,
    completedAt: archived.completedAt,
    durationMs: archived.durationMs,
    ...(archived.provider ? { provider: archived.provider } : {}),
    ...(archived.usage ? { usage: archived.usage } : {}),
    ...(archived.cancel ? { cancel: archived.cancel } : {}),
    handoff,
    ...(archived.evidence ? { evidence: archived.evidence } : {}),
  })
}
