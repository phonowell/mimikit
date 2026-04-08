import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  Task,
  TaskGitExecution,
  TaskGitLifecycle,
  TaskGitReview,
} from '../../foundation/types/index.js'
const REVIEW_SENTINEL_RELATIVE_PATH = join(
  '.mimikit',
  'review-code-changes.passed',
)
const parseReviewSentinel = (
  content: string,
): { at?: string; sha?: string } => {
  const result: { at?: string; sha?: string } = {}
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (!value) continue
    if (key === 'at') result.at = value
    if (key === 'sha') result.sha = value
  }
  return result
}
const gitIsAncestorOfMain = (params: {
  cwd?: string | undefined
  repoKey?: string | undefined
  sha: string
}): boolean | undefined => {
  const sha = params.sha.trim()
  if (!sha) return undefined
  const baseArgs = ['merge-base', '--is-ancestor', sha, 'main']
  const args =
    typeof params.repoKey === 'string' && params.repoKey.trim().length > 0
      ? [`--git-dir=${params.repoKey.trim()}`, ...baseArgs]
      : baseArgs
  const result = spawnSync('git', args, {
    cwd: params.cwd,
    stdio: ['ignore', 'ignore', 'ignore'],
    encoding: 'utf8',
  })
  if (result.status === 0) return true
  if (result.status === 1) return false
  return undefined
}
export const resolveTaskGitLifecycleRuntimeTruth = (params: {
  git?: TaskGitExecution | undefined
  repoKey?: string | undefined
  lifecycle?: TaskGitLifecycle | undefined
}): TaskGitLifecycle | undefined => {
  const { lifecycle } = params
  if (!lifecycle) return undefined
  const reviewSha = lifecycle.review.sha?.trim()
  if (!reviewSha) return lifecycle
  const worktreePath = params.git?.worktreePath.trim()
  const merged = gitIsAncestorOfMain({
    cwd: worktreePath && existsSync(worktreePath) ? worktreePath : undefined,
    repoKey: params.repoKey,
    sha: reviewSha,
  })
  if (merged === undefined) return lifecycle
  return {
    ...lifecycle,
    merged,
  }
}
export const deriveTaskGitLifecycle = (params: {
  git?: TaskGitExecution | undefined
  repoKey?: string | undefined
}): TaskGitLifecycle | undefined => {
  const worktreePath = params.git?.worktreePath.trim()
  if (!worktreePath) return undefined
  const cleaned = !existsSync(worktreePath)
  const sentinelPath = join(worktreePath, REVIEW_SENTINEL_RELATIVE_PATH)
  const hasSentinel = existsSync(sentinelPath)
  const review: TaskGitLifecycle['review'] = { passed: hasSentinel }
  if (hasSentinel) {
    try {
      const parsed = parseReviewSentinel(readFileSync(sentinelPath, 'utf8'))
      if (parsed.at) review.at = parsed.at
      if (parsed.sha) review.sha = parsed.sha
    } catch {
      // Keep `passed=true` as long as sentinel exists.
    }
  }

  const merged =
    !!review.sha &&
    gitIsAncestorOfMain({
      cwd: cleaned ? undefined : worktreePath,
      repoKey: params.repoKey,
      sha: review.sha,
    }) === true
  return { review, merged, cleaned }
}
export type TaskGitLifecyclePatch = {
  review?: Partial<TaskGitReview> | undefined
  merged?: boolean | undefined
  mergedAt?: string | undefined
  cleaned?: boolean | undefined
  cleanedAt?: string | undefined
}
export const mergeTaskGitLifecycle = (params: {
  current?: TaskGitLifecycle | undefined
  patch?: TaskGitLifecyclePatch | undefined
}): TaskGitLifecycle | undefined => {
  const { current, patch } = params
  if (!current && !patch) return undefined
  return {
    review: {
      passed: Boolean(
        (current?.review.passed ?? false) || (patch?.review?.passed ?? false),
      ),
      ...(patch?.review?.at
        ? { at: patch.review.at }
        : current?.review.at
          ? { at: current.review.at }
          : {}),
      ...(patch?.review?.sha
        ? { sha: patch.review.sha }
        : current?.review.sha
          ? { sha: current.review.sha }
          : {}),
    },
    merged: Boolean((current?.merged ?? false) || (patch?.merged ?? false)),
    ...(patch?.mergedAt
      ? { mergedAt: patch.mergedAt }
      : current?.mergedAt
        ? { mergedAt: current.mergedAt }
        : {}),
    cleaned: Boolean((current?.cleaned ?? false) || (patch?.cleaned ?? false)),
    ...(patch?.cleanedAt
      ? { cleanedAt: patch.cleanedAt }
      : current?.cleanedAt
        ? { cleanedAt: current.cleanedAt }
        : {}),
  }
}
export const resolveTaskGitLifecycle = (
  task: Pick<Task, 'git' | 'repoKey'>,
): TaskGitLifecycle | undefined =>
  resolveTaskGitLifecycleRuntimeTruth({
    git: task.git,
    repoKey: task.repoKey,
    lifecycle: mergeTaskGitLifecycle({
      current: deriveTaskGitLifecycle(task),
      patch: task.git?.lifecycle,
    }),
  })
export const resolveTaskGitLifecycleTruth = (
  task: Pick<Task, 'git' | 'repoKey' | 'result'>,
): TaskGitLifecycle | undefined => {
  const lifecycle = mergeTaskGitLifecycle({
    current: resolveTaskGitLifecycle(task),
    patch: task.result?.handoff?.git?.lifecycle?.review
      ? { review: task.result.handoff.git.lifecycle.review }
      : undefined,
  })
  if (!lifecycle) return undefined
  const mergedAt = lifecycle.merged
    ? (task.git?.lifecycle?.mergedAt ??
      task.result?.handoff?.git?.lifecycle?.mergedAt)
    : undefined
  const cleanedAt = lifecycle.cleaned
    ? (task.git?.lifecycle?.cleanedAt ??
      task.result?.handoff?.git?.lifecycle?.cleanedAt)
    : undefined
  return mergeTaskGitLifecycle({
    current: lifecycle,
    patch: {
      ...(mergedAt ? { mergedAt } : {}),
      ...(cleanedAt ? { cleanedAt } : {}),
    },
  })
}
export const reconcileTaskGitState = (task: Task): Task => {
  if (!task.git) return task
  const lifecycle = resolveTaskGitLifecycleTruth(task)
  if (!lifecycle) return task
  const git = {
    ...task.git,
    lifecycle,
  } satisfies NonNullable<Task['git']>
  if (!task.result?.handoff?.git) return { ...task, git }
  return {
    ...task,
    git,
    result: {
      ...task.result,
      handoff: {
        ...task.result.handoff,
        git: {
          ...task.result.handoff.git,
          ...git,
          lifecycle,
        },
      },
    },
  }
}
