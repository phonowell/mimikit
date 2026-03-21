import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Task } from '../../types/index.js'

export type TaskGitClosureView = {
  review: {
    passed: boolean
    at?: string | undefined
    sha?: string | undefined
  }
  merged: boolean
  cleaned: boolean
}

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

export const deriveTaskGitClosure = (
  task: Task,
): TaskGitClosureView | undefined => {
  const worktreePath = task.git?.worktreePath.trim()
  if (!worktreePath) return undefined
  const cleaned = !existsSync(worktreePath)

  const sentinelPath = join(worktreePath, REVIEW_SENTINEL_RELATIVE_PATH)
  const hasSentinel = existsSync(sentinelPath)
  const review: TaskGitClosureView['review'] = { passed: hasSentinel }
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
      repoKey: task.repoKey,
      sha: review.sha,
    })

  return { review, merged, cleaned }
}
