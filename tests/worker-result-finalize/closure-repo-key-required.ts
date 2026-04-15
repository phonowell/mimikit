import { afterEach, expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { markTaskSucceeded } from '../../src/work/orchestrator/task-lifecycle.js'
import { createReviewPassedClosureWorktree } from '../helpers/git-closure-worktree.js'
import { cleanupGitRepos } from '../helpers/git-repo.js'

import {
  createClosureRuntime,
  createClosureSourceTask,
  createClosureSuccessResult,
} from './closure-testkit.js'

afterEach(cleanupGitRepos)

test('finalizeResult rejects closure task without repoKey truth source', async () => {
  const { repoRoot, worktreeRoot } = await createReviewPassedClosureWorktree({
    worktreeName: 'feature-closure-missing-repo-key',
    branch: 'task/feature-closure-missing-repo-key',
  })
  const branch = 'task/feature-closure-missing-repo-key'
  const task = createClosureSourceTask({
    id: 'task-source-closure-missing-repo-key',
    title: '落地 closure repoKey 硬约束',
    executionSpecId: 'spec-task-source-closure-missing-repo-key',
    worktreeRoot,
    branch,
    acceptance: ['已通过 pnpm review-code-changes'],
  })
  const runtime = await createClosureRuntime(repoRoot, task)
  const result = createClosureSuccessResult(task.id)

  await expect(
    finalizeResult(runtime, task, result, markTaskSucceeded),
  ).rejects.toThrow('closure task requires repoKey')
  expect(runtime.domain.tasks).toHaveLength(1)
}, 30_000)
