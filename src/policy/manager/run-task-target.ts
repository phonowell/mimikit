import { createHash } from 'node:crypto'

import { buildTaskFingerprint } from '../../work/orchestrator/task-state.js'
import {
  resolveTaskExecutionTarget,
  type TaskExecutionTarget,
} from '../../work/shared/task-execution-target.js'
import { resolveTaskResourceMode } from '../../work/shared/task-resource-mode.js'
import { materializeTaskWorktreeCwd } from '../../work/shared/task-worktree-materialize.js'

import { ActionApplyFeedbackError } from './action-apply-feedback-error.js'
import { formatEnqueueTaskWorktreePrepareFailedHint } from './action-feedback-hints.js'

import type {
  TaskContract,
  TaskResourceMode,
} from '../../foundation/types/index.js'

export type RunTaskTarget = TaskExecutionTarget & {
  resourceMode: TaskResourceMode
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
    ...(params.contract ? { contract: params.contract } : {}),
  })
  const slug = normalizeBranchSlug(params.title).slice(0, 24)
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 10)
  return `task/${slug}-${hash}`
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
  prompt: string
  title: string
  focusId: string
  contract?: TaskContract | undefined
  branch?: string | undefined
}): Promise<RunTaskTarget> => {
  const resourceMode = resolveTaskResourceMode(params.resourceMode)
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
    }
  }
  if (resourceMode === 'read') {
    return {
      ...(await resolveTaskExecutionTarget(params.cwd)),
      resourceMode,
    }
  }
  const baseTarget = await resolveTaskExecutionTarget(params.cwd)
  if (!baseTarget.repoKey) {
    return {
      ...baseTarget,
      resourceMode,
    }
  }
  const branch = buildAutoTaskBranch({
    prompt: params.prompt,
    title: params.title,
    cwd: params.cwd,
    focusId: params.focusId,
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
  }
}
