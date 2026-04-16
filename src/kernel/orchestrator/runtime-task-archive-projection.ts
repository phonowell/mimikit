import { bestEffort } from '../../persistence/log/safe.js'
import {
  readTaskResultArchive,
  writeTaskResultArchiveAtPath,
} from '../../persistence/storage/task-results.js'
import { readTaskExecutionSpec } from '../../work/spec/store.js'

import type { Task, TaskResult } from '../../foundation/types/index.js'
import type { TaskArchiveEntry } from '../../persistence/storage/task-results.js'

type TaskArchiveProjectionSnapshot = {
  status?: TaskResult['status']
  taskStatus?: TaskResult['taskStatus']
  outcome?: TaskResult['outcome']
  stopReason?: TaskResult['stopReason']
  completedAt?: TaskResult['completedAt']
  durationMs?: TaskResult['durationMs']
  handoff?: TaskResult['handoff']
}

const resolveTaskArchiveProjectionPath = (task: Task): string | undefined => {
  const resultPath = task.result?.archivePath?.trim()
  if (resultPath) return resultPath
  const archivePath = task.archivePath?.trim()
  return archivePath && archivePath.length > 0 ? archivePath : undefined
}

const buildTaskArchiveProjectionSnapshot = (
  entry: TaskArchiveProjectionSnapshot | null,
) =>
  JSON.stringify({
    status: entry?.status,
    taskStatus: entry?.taskStatus,
    outcome: entry?.outcome,
    stopReason: entry?.stopReason,
    completedAt: entry?.completedAt,
    durationMs: entry?.durationMs,
    git: entry?.handoff?.git ?? null,
  })

const buildProjectedTaskArchiveEntry = (params: {
  task: Task
  archived: TaskResult
  prompt: string
}): TaskArchiveEntry => {
  const { task, archived, prompt } = params
  const { result } = task
  const handoff = result?.handoff
  if (!result || !handoff?.git) {
    throw new Error(
      `task archive projection requires result git handoff: ${task.id}`,
    )
  }

  return {
    taskId: archived.taskId,
    focusId: task.focusId,
    title: task.title,
    status: result.status,
    ...(result.taskStatus ? { taskStatus: result.taskStatus } : {}),
    ...(result.outcome ? { outcome: result.outcome } : {}),
    ...(result.stopReason ? { stopReason: result.stopReason } : {}),
    prompt,
    output: archived.output,
    createdAt: task.createdAt,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    ...(result.provider ? { provider: result.provider } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
    ...(result.traceRef ? { traceRef: result.traceRef } : {}),
    ...(result.cancel ? { cancel: result.cancel } : {}),
    handoff: {
      ...(archived.handoff ?? handoff),
      git: handoff.git,
    },
    ...(result.evidence ? { evidence: result.evidence } : {}),
  }
}

const syncTaskArchiveProjection = async (
  stateDir: string,
  task: Task,
): Promise<void> => {
  const archivePath = resolveTaskArchiveProjectionPath(task)
  const { result } = task
  const handoff = result?.handoff
  if (!archivePath || !result || !handoff?.git) return

  const archived = await readTaskResultArchive(archivePath)
  if (!archived) return

  let prompt: string | undefined
  try {
    const spec = await readTaskExecutionSpec(stateDir, task.executionSpecId)
    prompt = spec.prompt
  } catch {
    return
  }

  const nextEntry = buildProjectedTaskArchiveEntry({
    task,
    archived,
    prompt,
  })
  if (
    buildTaskArchiveProjectionSnapshot(archived) ===
    buildTaskArchiveProjectionSnapshot(nextEntry)
  )
    return

  await writeTaskResultArchiveAtPath(archivePath, nextEntry)
}

export const syncReconciledTaskArchives = async (
  stateDir: string,
  tasks: Task[],
): Promise<void> => {
  for (const task of tasks) {
    await bestEffort('syncTaskArchiveProjection', () =>
      syncTaskArchiveProjection(stateDir, task),
    )
  }
}
