import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildTaskFingerprint } from '../../work/orchestrator/task-state.js'
import {
  expandHomeDir,
  resolveTaskExecutionTarget,
  type TaskExecutionTarget,
} from '../../work/shared/task-execution-target.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'
import { materializeTaskWorktreeCwd } from '../../work/shared/task-worktree-materialize.js'

import { ActionApplyFeedbackError } from './action-apply-feedback-error.js'
import {
  formatEnqueueTaskCwdInvalidHint,
  formatEnqueueTaskWorktreePrepareFailedHint,
} from './action-feedback-hints.js'

import type {
  TaskContract,
  TaskResourceMode,
} from '../../foundation/types/index.js'

export type RunTaskTarget = TaskExecutionTarget & {
  resourceMode: TaskResourceMode
  useWorktree: boolean
}

const normalizeBranchSlug = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[/\\]+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized.length > 0 ? normalized : 'task'
}

const buildAutoTaskBranch = (params: {
  prompt: string
  title: string
  cwd: string
  focusId: string
  useWorktree?: boolean
  contract?: TaskContract
}): string => {
  const seed = buildTaskFingerprint({
    prompt: params.prompt,
    title: params.title,
    cwd: params.cwd,
    resourceMode: 'write',
    profile: 'worker',
    provider: 'codex',
    focusId: params.focusId,
    ...(params.useWorktree ? { useWorktree: true } : {}),
    ...(params.contract ? { contract: params.contract } : {}),
  })
  const slug = normalizeBranchSlug(params.title).slice(0, 24)
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 10)
  return `task/${slug}-${hash}`
}

const assertExistingTaskCwd = async (params: {
  actionName: string
  cwd: string
}): Promise<void> => {
  const resolvedCwd = resolve(expandHomeDir(params.cwd))
  try {
    const cwdStat = await stat(resolvedCwd)
    if (cwdStat.isDirectory()) return
    throw new ActionApplyFeedbackError({
      action: params.actionName,
      error: 'action_execution_rejected',
      hint: formatEnqueueTaskCwdInvalidHint('`task.cwd` 当前不是目录。'),
    })
  } catch (error) {
    if (error instanceof ActionApplyFeedbackError) throw error
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
    throw new ActionApplyFeedbackError({
      action: params.actionName,
      error: 'action_execution_rejected',
      hint: formatEnqueueTaskCwdInvalidHint(
        code === 'ENOENT'
          ? '`task.cwd` 当前不存在。'
          : '`task.cwd` 当前不可访问。',
      ),
    })
  }
}

const resolveEffectiveCwd = async (params: {
  actionName: string
  cwd: string
  branch?: string
}): Promise<string> => {
  const effectiveCwd = params.branch
    ? await materializeTaskWorktreeCwd(params.cwd, params.branch)
    : { ok: true as const, cwd: params.cwd }
  if (effectiveCwd.ok) return effectiveCwd.cwd
  throw new ActionApplyFeedbackError({
    action: params.actionName,
    error: 'action_execution_rejected',
    hint: formatEnqueueTaskWorktreePrepareFailedHint(
      params.branch ?? '',
      effectiveCwd.detail,
    ),
  })
}

export const resolveRunTaskTarget = async (params: {
  actionName: string
  cwd: string
  resourceMode?: TaskResourceMode | undefined
  useWorktree?: boolean | undefined
  prompt: string
  title: string
  focusId: string
  contract?: TaskContract | undefined
  branch?: string | undefined
}): Promise<RunTaskTarget> => {
  const resourceMode = resolveTaskResourceMode(params.resourceMode)
  if (resourceMode === 'write') {
    await assertExistingTaskCwd({
      actionName: params.actionName,
      cwd: params.cwd,
    })
  }
  const explicitBranch = params.branch?.trim()
  if (explicitBranch) {
    const effectiveCwd = await resolveEffectiveCwd({
      actionName: params.actionName,
      cwd: params.cwd,
      branch: explicitBranch,
    })
    return {
      ...(await resolveTaskExecutionTarget(effectiveCwd)),
      resourceMode,
      useWorktree: true,
    }
  }
  if (resourceMode === 'read') {
    return {
      ...(await resolveTaskExecutionTarget(params.cwd)),
      resourceMode,
      useWorktree: false,
    }
  }
  if (params.useWorktree !== true) {
    return {
      ...(await resolveTaskExecutionTarget(params.cwd)),
      resourceMode,
      useWorktree: false,
    }
  }
  const branch = buildAutoTaskBranch({
    prompt: params.prompt,
    title: params.title,
    cwd: params.cwd,
    focusId: params.focusId,
    useWorktree: params.useWorktree,
    ...(params.contract ? { contract: params.contract } : {}),
  })
  const effectiveCwd = await resolveEffectiveCwd({
    actionName: params.actionName,
    cwd: params.cwd,
    branch,
  })
  return {
    ...(await resolveTaskExecutionTarget(effectiveCwd, branch)),
    resourceMode,
    useWorktree: true,
  }
}
