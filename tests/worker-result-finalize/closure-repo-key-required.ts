import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { markTaskSucceeded } from '../../src/work/orchestrator/task-lifecycle.js'
import { cleanupGitRepos, createGitRepo } from '../helpers/git-repo.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { Task, TaskResult } from '../../src/foundation/types/index.js'

afterEach(cleanupGitRepos)

test('finalizeResult rejects closure task without repoKey truth source', async () => {
  const repoRoot = await createGitRepo()
  const worktreeRoot = join(
    repoRoot,
    '.worktrees',
    'feature-closure-missing-repo-key',
  )
  const branch = 'task/feature-closure-missing-repo-key'
  await mkdir(join(repoRoot, '.worktrees'), { recursive: true })
  execFileSync('git', ['worktree', 'add', worktreeRoot, '-b', branch], {
    cwd: repoRoot,
    stdio: 'ignore',
  })
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
    `at=2026-04-01T03:20:00.000Z\nsha=${reviewSha}\n`,
    'utf8',
  )

  const task: Task = {
    id: 'task-source-closure-missing-repo-key',
    fingerprint: 'task-source-closure-missing-repo-key',
    semanticKey: 'task-source-closure-missing-repo-key',
    executionSpecId: 'spec-task-source-closure-missing-repo-key',
    title: '落地 closure repoKey 硬约束',
    cwd: worktreeRoot,
    resourceMode: 'write',
    branch,
    git: {
      worktreePath: worktreeRoot,
      branch,
      closureRequired: true,
    },
    contract: {
      goal: '完成实现并给出结果说明',
      scope: '在独立 wt 完成实现与验证',
      acceptance: ['已通过 pnpm review-code-changes'],
    },
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-04-01T03:00:00.000Z',
    startedAt: '2026-04-01T03:00:10.000Z',
  }
  const runtime = await createTestRuntimeState({
    workDir: repoRoot,
    withGlobalFocus: false,
    pausedQueue: true,
    patch: {
      tasks: [task],
      focuses: [
        {
          id: 'focus-local',
          title: 'Local',
          status: 'active',
          createdAt: '2026-04-01T03:00:00.000Z',
          updatedAt: '2026-04-01T03:00:00.000Z',
          lastActivityAt: '2026-04-01T03:00:00.000Z',
        },
      ],
    },
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: '实现与门禁都已完成，等待主仓收尾。',
    durationMs: 90,
    completedAt: '2026-04-01T03:30:00.000Z',
  }

  await expect(
    finalizeResult(runtime, task, result, markTaskSucceeded),
  ).rejects.toThrow('closure task requires repoKey')
  expect(runtime.tasks).toHaveLength(1)
})
