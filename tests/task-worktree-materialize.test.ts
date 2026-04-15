import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { materializeTaskWorktreeCwd } from '../src/work/shared/task-worktree-materialize.js'

import { cleanupGitRepos, createGitRepo } from './helpers/git-repo.js'

afterEach(cleanupGitRepos)

test('materializeTaskWorktreeCwd rejects legacy same-branch worktree outside repo-local root', async () => {
  const repoRoot = await createGitRepo()
  const legacyWorktree = `${repoRoot}-legacy-task-worktree`
  const branch = 'task/legacy-outside-worktree'
  execFileSync('git', ['worktree', 'add', legacyWorktree, '-b', branch], {
    cwd: repoRoot,
    stdio: 'ignore',
  })

  const result = await materializeTaskWorktreeCwd(join(repoRoot, 'src'), branch)

  expect(result.ok).toBe(false)
  expect(result.detail).toContain('.worktrees')
  expect(result.detail).toContain(legacyWorktree)
}, 30_000)
