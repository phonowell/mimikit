import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createGitRepo } from './git-repo.js'

export const createMergedClosureRepo = async (): Promise<{
  repoRoot: string
  worktreePath: string
  branch: string
  reviewSha: string
}> => {
  const repoRoot = await createGitRepo()
  const worktreePath = join(repoRoot, '.worktrees', 'closure-truth')
  const branch = 'task/closure-truth'

  await mkdir(join(repoRoot, '.worktrees'), { recursive: true })
  execFileSync('git', ['worktree', 'add', worktreePath, '-b', branch], {
    cwd: repoRoot,
    stdio: 'ignore',
  })
  await writeFile(join(worktreePath, 'src', 'closure-truth.ts'), 'export {}\n')
  execFileSync('git', ['add', '.'], { cwd: worktreePath, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'closure truth'], {
    cwd: worktreePath,
    stdio: 'ignore',
  })
  const reviewSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: worktreePath,
    encoding: 'utf8',
  }).trim()

  await mkdir(join(worktreePath, '.mimikit'), { recursive: true })
  await writeFile(
    join(worktreePath, '.mimikit', 'review-code-changes.passed'),
    `at=2026-04-01T03:21:30.000Z\nsha=${reviewSha}\n`,
    'utf8',
  )

  execFileSync(
    'git',
    ['merge', '--no-ff', branch, '-m', 'merge closure truth'],
    {
      cwd: repoRoot,
      stdio: 'ignore',
    },
  )
  execFileSync('git', ['worktree', 'remove', worktreePath, '--force'], {
    cwd: repoRoot,
    stdio: 'ignore',
  })
  execFileSync('git', ['branch', '-D', branch], {
    cwd: repoRoot,
    stdio: 'ignore',
  })

  return { repoRoot, worktreePath, branch, reviewSha }
}
