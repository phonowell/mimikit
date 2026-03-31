import { toDisplayPath } from '../../surface/shared/path-display.js'
import { resolveTaskLabel } from '../../work/shared/task-state.js'

import { resolveTaskChangedAt } from './format-base.js'
import { pickArchivePath } from './format-task-result-payload.js'

import type {
  Task,
  TaskCancelMeta,
  TaskContract,
  TaskResult,
} from '../types/index.js'

const toCancelMeta = (
  cancel?: TaskCancelMeta,
): Record<string, unknown> | undefined =>
  cancel
    ? {
        source: cancel.source,
        ...(cancel.reason ? { reason: cancel.reason } : {}),
      }
    : undefined

const toContractPayload = (
  contract?: TaskContract,
): Record<string, unknown> | undefined => {
  if (!contract) return undefined
  return {
    goal: contract.goal,
    scope: contract.scope,
    acceptance: contract.acceptance,
    ...(contract.outOfScope ? { out_of_scope: contract.outOfScope } : {}),
    ...(contract.contextRefs ? { context_refs: contract.contextRefs } : {}),
  }
}

export const formatTaskPromptEntry = (
  task: Task,
  result: TaskResult | undefined,
  workDir?: string,
): Record<string, unknown> => {
  const archivePath = pickArchivePath(
    result?.archivePath,
    task.archivePath,
    workDir,
  )
  return {
    ...(archivePath ? { archive_path: archivePath } : {}),
    id: task.id,
    status: task.status,
    ...(toContractPayload(task.contract)
      ? { contract: toContractPayload(task.contract) }
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

export const formatTaskPromptCard = (
  task: Task,
  result: TaskResult | undefined,
  workDir?: string,
): Record<string, unknown> => {
  const archivePath = pickArchivePath(
    result?.archivePath,
    task.archivePath,
    workDir,
  )
  return {
    ...(archivePath ? { archive_path: archivePath } : {}),
    id: task.id,
    status: task.status,
    title: resolveTaskLabel(task),
    cwd: toDisplayPath(task.cwd, workDir),
    changed_at: resolveTaskChangedAt(task),
  }
}
