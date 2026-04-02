import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { markTaskSucceeded } from '../../src/work/orchestrator/task-lifecycle.js'
import { readTaskExecutionSpec } from '../../src/work/spec/store.js'
import { cleanupGitRepos, createGitRepo } from '../helpers/git-repo.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import type { Task, TaskResult } from '../../src/foundation/types/index.js'

afterEach(cleanupGitRepos)

test('finalizeResult pauses merge-required write task and enqueues repo-root closure task', async () => {
  const repoRoot = await createGitRepo()
  const worktreeRoot = join(repoRoot, '.worktrees', 'feature-closure')
  const branch = 'task/feature-closure'
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
    id: 'task-source-closure',
    fingerprint: 'task-source-closure',
    semanticKey: 'task-source-closure',
    executionSpecId: 'spec-task-source-closure',
    title: '落地 output tokens 收缩',
    cwd: worktreeRoot,
    resourceMode: 'write',
    repoKey: join(repoRoot, '.git'),
    branch,
    git: {
      worktreePath: worktreeRoot,
      branch,
      closureRequired: true,
    },
    contract: {
      goal: '完成实现并给出结果说明',
      scope: '在独立 wt 完成实现与验证',
      acceptance: [
        '已通过 pnpm review-code-changes',
        '已产出结果说明',
        '已归档执行证据',
      ],
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
    handoff: {
      summary: '实现与门禁已完成。',
    },
    durationMs: 90,
    completedAt: '2026-04-01T03:30:00.000Z',
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
})
