import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/signals.js'
import { clearTaskResumeChoice } from '../orchestrator/core/task-resume-choice.js'
import { nowIso } from '../shared/utils.js'

import {
  removeFileWithinRoot,
  removeTaskProgressFiles,
  removeTaskSystemHistoryEntries,
  removeWorkerTaskPromptFiles,
} from './delete-task-cleanup.js'
import {
  buildTaskMutationMetaFields,
  isActiveTaskStatus,
  resolveTaskLookupTarget,
  touchTaskMutation,
} from './task-action.js'
import { resolveTaskChangeAt } from './task-state-shared.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'

export type DeleteTaskMeta = {
  source?: string
  reason?: string
}

export type DeleteTaskResult = {
  ok: boolean
  id: string
  status: 'deleted' | 'not_found' | 'invalid' | 'active_task'
  changeAt?: string
}

export const deleteTask = async (
  runtime: RuntimeState,
  taskId: string,
  meta?: DeleteTaskMeta,
): Promise<DeleteTaskResult> => {
  const lookup = resolveTaskLookupTarget(runtime, taskId)
  if ('status' in lookup)
    return { ok: false, id: lookup.id, status: lookup.status }
  const { index, task } = lookup
  if (isActiveTaskStatus(task.status)) {
    return {
      ok: false,
      id: task.id,
      status: 'active_task',
      changeAt: resolveTaskChangeAt(task),
    }
  }

  const historyDeleted = await removeTaskSystemHistoryEntries(
    runtime.paths.history,
    task.id,
  )
  const archivePaths = [task.archivePath, task.result?.archivePath].filter(
    (item): item is string => Boolean(item?.trim()),
  )
  let archiveDeleted = 0
  let archiveMissing = 0
  let archiveOutside = 0
  for (const archivePath of new Set(archivePaths)) {
    const removed = await removeFileWithinRoot({
      rootPath: runtime.config.workDir,
      targetPath: archivePath,
    })
    if (removed === 'deleted') archiveDeleted += 1
    if (removed === 'missing') archiveMissing += 1
    if (removed === 'outside') archiveOutside += 1
  }
  const progressDeleted = await removeTaskProgressFiles(
    runtime.config.workDir,
    task.id,
  )
  const promptDeleted = await removeWorkerTaskPromptFiles(
    runtime.config.workDir,
    task.id,
  )

  touchTaskMutation(runtime, task.id)
  clearTaskResumeChoice(runtime, task.id)
  runtime.tasks.splice(index, 1)
  runtime.worker.runningControllers.delete(task.id)
  const deletedAt = nowIso()

  await bestEffort('persistRuntimeState: task_deleted', () =>
    persistRuntimeState(runtime),
  )
  await bestEffort('appendLog: task_deleted', () =>
    appendLog(runtime.paths.log, {
      event: 'task_deleted',
      taskId: task.id,
      deletedAt,
      status: task.status,
      historyDeleted,
      archiveDeleted,
      archiveMissing,
      archiveOutside,
      progressDeleted,
      promptDeleted,
      ...buildTaskMutationMetaFields(meta),
    }),
  )
  notifyUiSignal(runtime, 'messages')
  return {
    ok: true,
    id: task.id,
    status: 'deleted',
    changeAt: deletedAt,
  }
}
