import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createGitRepo } from './git-repo.js'

export const createReviewPassedClosureWorktree = async (params: {
  worktreeName: string
  branch: string
  reviewAt?: string
  repoRootBranch?: string
}): Promise<{
  repoRoot: string
  reviewSha: string
  worktreeRoot: string
}> => {
  const repoRoot = await createGitRepo()
  const worktreeRoot = join(repoRoot, '.worktrees', params.worktreeName)
  await mkdir(join(repoRoot, '.worktrees'), { recursive: true })
  execFileSync('git', ['worktree', 'add', worktreeRoot, '-b', params.branch], {
    cwd: repoRoot,
    stdio: 'ignore',
  })
  if (params.repoRootBranch) {
    execFileSync('git', ['checkout', '-b', params.repoRootBranch], {
      cwd: repoRoot,
      stdio: 'ignore',
    })
  }
  await writeFile(
    join(worktreeRoot, 'src', 'index.ts'),
    'export const ready = false\n',
    'utf8',
  )
  execFileSync('git', ['add', '.'], { cwd: worktreeRoot, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'change'], {
    cwd: worktreeRoot,
    stdio: 'ignore',
  })
  const reviewSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: worktreeRoot,
    encoding: 'utf8',
  }).trim()
  await mkdir(join(worktreeRoot, '.mimikit'), { recursive: true })
  await writeFile(
    join(worktreeRoot, '.mimikit', 'review-code-changes.passed'),
    `at=${params.reviewAt ?? '2026-04-01T03:20:00.000Z'}\nsha=${reviewSha}\n`,
    'utf8',
  )
  return { repoRoot, reviewSha, worktreeRoot }
}
