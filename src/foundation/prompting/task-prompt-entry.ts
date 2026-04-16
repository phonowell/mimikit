import { toDisplayPath } from '../../surface/shared/path-display.js'
import { resolveTaskLabel } from '../../work/shared/task-state.js'

import { resolveTaskChangedAt } from './format-base.js'
import { pickArchivePath } from './format-task-result-payload.js'
import { buildTaskContractPromptPayload } from './task-contract-prompt-payload.js'

import type { Task, TaskCancelMeta, TaskResult } from '../types/index.js'

export type TaskPromptEntryOptions = {
  workingFocusIds?: string[] | undefined
  latestResultTaskId?: string | undefined
  detail?: 'full' | 'card' | undefined
}

const toCancelMeta = (
  cancel?: TaskCancelMeta,
): Record<string, unknown> | undefined =>
  cancel
    ? {
        source: cancel.source,
        ...(cancel.reason ? { reason: cancel.reason } : {}),
      }
    : undefined

const resolveTaskStopReason = (
  task: Task,
  result: TaskResult | undefined,
): string | undefined => result?.stopReason ?? task.result?.stopReason

export const formatTaskPromptEntry = (
  task: Task,
  result: TaskResult | undefined,
  workDir?: string,
  options?: TaskPromptEntryOptions,
): Record<string, unknown> => {
  const archivePath = pickArchivePath(
    result?.archivePath,
    task.archivePath,
    workDir,
  )
  if (options?.detail === 'card') {
    return {
      ...(archivePath ? { archive_path: archivePath } : {}),
      id: task.id,
      title: resolveTaskLabel(task),
      status: task.status,
      focus_id: task.focusId,
      changed_at: resolveTaskChangedAt(task),
      workline_match: Boolean(options.workingFocusIds?.includes(task.focusId)),
      latest_result_anchor: task.id === options.latestResultTaskId,
      ...(resolveTaskStopReason(task, result)
        ? { stop_reason: resolveTaskStopReason(task, result) }
        : {}),
      ...(task.status === 'canceled' && task.cancel
        ? { cancel: toCancelMeta(task.cancel) }
        : {}),
    }
  }
  return {
    ...(archivePath ? { archive_path: archivePath } : {}),
    id: task.id,
    status: task.status,
    ...(buildTaskContractPromptPayload(task.contract)
      ? { contract: buildTaskContractPromptPayload(task.contract) }
      : {}),
    resource_mode: task.resourceMode ?? 'write',
    provider: task.provider,
    cwd: toDisplayPath(task.cwd, workDir),
    ...(task.repoKey ? { repo_key: task.repoKey } : {}),
    ...(task.branch ? { branch: task.branch } : {}),
    ...(task.git
      ? {
          git: {
            worktree_path: toDisplayPath(task.git.worktreePath, workDir),
            branch: task.git.branch,
          },
        }
      : {}),
    title: resolveTaskLabel(task),
    changed_at: resolveTaskChangedAt(task),
    ...(task.status === 'canceled' && task.cancel
      ? { cancel: toCancelMeta(task.cancel) }
      : {}),
  }
}
