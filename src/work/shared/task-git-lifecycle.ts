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
}): boolean => {
  const sha = params.sha.trim()
  if (!sha) return false
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
  return result.status === 0
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
    })

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
  mergeTaskGitLifecycle({
    current: deriveTaskGitLifecycle(task),
    patch: task.git?.lifecycle,
  })
