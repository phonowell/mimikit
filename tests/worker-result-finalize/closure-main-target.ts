import { afterEach, expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { markTaskSucceeded } from '../../src/work/orchestrator/task-lifecycle.js'
import { createReviewPassedClosureWorktree } from '../helpers/git-closure-worktree.js'
import { cleanupGitRepos } from '../helpers/git-repo.js'

import {
  createClosureRuntime,
  createClosureSourceTask,
  createClosureSuccessResult,
  createRepoKey,
} from './closure-testkit.js'

afterEach(cleanupGitRepos)

test('finalizeResult binds closure task to main even when repo root is checked out elsewhere', async () => {
  const { repoRoot, worktreeRoot } = await createReviewPassedClosureWorktree({
    worktreeName: 'feature-closure-main-target',
    branch: 'task/feature-closure-main-target',
    repoRootBranch: 'ops/repo-root-active',
  })
  const branch = 'task/feature-closure-main-target'
  const task = createClosureSourceTask({
    id: 'task-source-closure-main-target',
    title: '收尾应绑定 main',
    executionSpecId: 'spec-task-source-closure-main-target',
    worktreeRoot,
    branch,
    repoKey: createRepoKey(repoRoot),
    acceptance: ['已通过 pnpm review-code-changes'],
  })
  const runtime = await createClosureRuntime(repoRoot, task)
  const result = createClosureSuccessResult(task.id)

  await finalizeResult(runtime, task, result, markTaskSucceeded)

  const closureTask = runtime.domain.tasks.find((item) => item.id !== task.id)
  expect(closureTask?.branch).toBe('main')
}, 30_000)
