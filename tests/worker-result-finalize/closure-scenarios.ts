import { afterEach, expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { markTaskSucceeded } from '../../src/work/orchestrator/task-lifecycle.js'
import { readTaskExecutionSpec } from '../../src/work/spec/store.js'
import { createReviewPassedClosureWorktree } from '../helpers/git-closure-worktree.js'
import { cleanupGitRepos } from '../helpers/git-repo.js'

import {
  createClosureRuntime,
  createClosureSourceTask,
  createClosureSuccessResult,
  createRepoKey,
} from './closure-testkit.js'

afterEach(cleanupGitRepos)

test('finalizeResult pauses merge-required write task and enqueues repo-root closure task', async () => {
  const { repoRoot, worktreeRoot } = await createReviewPassedClosureWorktree({
    worktreeName: 'feature-closure',
    branch: 'task/feature-closure',
  })
  const branch = 'task/feature-closure'
  const task = createClosureSourceTask({
    id: 'task-source-closure',
    title: '落地 output tokens 收缩',
    executionSpecId: 'spec-task-source-closure',
    worktreeRoot,
    branch,
    repoKey: createRepoKey(repoRoot),
    acceptance: [
      '已通过 pnpm review-code-changes',
      '已产出结果说明',
      '已归档执行证据',
    ],
  })
  const runtime = await createClosureRuntime(repoRoot, task)
  const result = {
    ...createClosureSuccessResult(task.id),
    handoff: {
      summary: '实现与门禁已完成。',
    },
  }

  await finalizeResult(runtime, task, result, markTaskSucceeded)

  expect(task.status).toBe('paused')
  expect(result.taskStatus).toBe('paused')
  expect(result.outcome).toBe('blocked')
  expect(result.stopReason).toBe('closure_pending')
  expect(
    result.evidence?.acceptanceChecks.every((item) => item.met === false),
  ).toBe(true)

  const closureTask = runtime.domain.tasks.find((item) => item.id !== task.id)
  expect(closureTask).toMatchObject({
    title: '收尾：落地 output tokens 收缩',
    cwd: repoRoot,
    resourceMode: 'write',
    status: 'pending',
    focusId: 'focus-local',
  })
  expect(closureTask?.git).toBeUndefined()
  const closureSpec = await readTaskExecutionSpec(
    repoRoot,
    closureTask?.executionSpecId ?? '',
  )
  expect(closureSpec.prompt).toContain(task.id)
  expect(closureSpec.prompt).toContain(branch)
  expect(closureSpec.prompt).toContain(worktreeRoot)
}, 30_000)
