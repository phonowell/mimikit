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

test('finalizeResult keeps source task succeeded and enqueues repo-root closure task as follow-up work', async () => {
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

  expect(task.status).toBe('succeeded')
  expect(result.taskStatus).toBe('succeeded')
  expect(result.outcome).toBe('completed')
  expect(result.stopReason).toBe('completed')
  expect(task.pausedAt).toBeUndefined()
  expect(result.handoff).toBeDefined()
  const nextSteps = result.handoff.nextSteps ?? []
  expect(nextSteps).toContain(`在主仓完成 ${branch} 的 merge/cleanup 收尾`)
  expect(nextSteps).toContain('收尾后回写 git closure 真相并复核归档')

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
