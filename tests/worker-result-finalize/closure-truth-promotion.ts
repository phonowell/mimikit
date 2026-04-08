import { join } from 'node:path'

import { expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { createMergedClosureRepo } from '../helpers/git-closure-truth.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

import { mergeTaskPatch } from './testkit.js'

import type { Task, TaskResult } from '../../src/foundation/types/index.js'

test('finalizeResult promotes runtime-verifiable merged truth into the referenced source task before the next manager round', async () => {
  const { repoRoot, worktreePath, branch, reviewSha } =
    await createMergedClosureRepo()
  const sourceTask: Task = {
    id: 'task-source-closure-truth-runtime',
    fingerprint: 'task-source-closure-truth-runtime',
    semanticKey: 'task-source-closure-truth-runtime',
    executionSpecId: 'spec-task-source-closure-truth-runtime',
    title: '源任务待收尾',
    cwd: worktreePath,
    resourceMode: 'write',
    repoKey: join(repoRoot, '.git'),
    branch,
    git: {
      worktreePath,
      branch,
      closureRequired: true,
      lifecycle: {
        review: { passed: false },
        merged: false,
        cleaned: false,
      },
    },
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'paused',
    createdAt: '2026-04-01T03:00:00.000Z',
    result: {
      taskId: 'task-source-closure-truth-runtime',
      status: 'succeeded',
      ok: true,
      output: 'waiting for closure',
      durationMs: 1,
      completedAt: '2026-04-01T03:20:00.000Z',
      taskStatus: 'paused',
      outcome: 'blocked',
      stopReason: 'closure_pending',
      handoff: {
        summary: 'waiting for closure',
        git: {
          worktreePath,
          branch,
          closureRequired: true,
          lifecycle: {
            review: { passed: false },
            merged: false,
            cleaned: false,
          },
        },
      },
    },
  }
  const closureTask: Task = {
    id: 'task-closure-source-closure-truth-runtime',
    fingerprint: 'task-closure-source-closure-truth-runtime',
    semanticKey: 'task-closure-source-closure-truth-runtime',
    executionSpecId: 'spec-task-closure-source-closure-truth-runtime',
    title: '收尾：源任务待收尾',
    cwd: '/tmp/source-closure-repo-runtime',
    resourceMode: 'write',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-04-01T03:21:00.000Z',
    startedAt: '2026-04-01T03:21:10.000Z',
    contract: {
      goal: '收尾源任务 git 闭环',
      scope: '只做 merge/cleanup 收尾',
      acceptance: ['源任务 git 真相已回写'],
      contextRefs: ['task:task-source-closure-truth-runtime'],
    },
  }
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      tasks: [sourceTask, closureTask],
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
  closureTask.contract = {
    goal: '收尾源任务 git 闭环',
    scope: '只做 merge/cleanup 收尾',
    acceptance: ['源任务 git 真相已回写'],
    contextRefs: ['task:task-source-closure-truth-runtime'],
  }
  const result: TaskResult = {
    taskId: closureTask.id,
    status: 'succeeded',
    ok: true,
    output: 'closure completed',
    durationMs: 30,
    completedAt: '2026-04-01T03:22:00.000Z',
    handoff: {
      summary: 'closure completed',
      git: {
        worktreePath: '/tmp/source-closure-truth-runtime',
        branch: 'task/source-closure-truth-runtime',
        closureRequired: true,
        lifecycle: {
          review: {
            passed: true,
            at: '2026-04-01T03:21:30.000Z',
            sha: reviewSha,
          },
          merged: true,
          mergedAt: '2026-04-01T03:21:45.000Z',
          cleaned: true,
          cleanedAt: '2026-04-01T03:22:00.000Z',
        },
      },
    },
  }

  await finalizeResult(runtime, closureTask, result, mergeTaskPatch)

  expect(sourceTask.git?.lifecycle).toMatchObject({
    review: {
      passed: true,
      at: '2026-04-01T03:21:30.000Z',
      sha: reviewSha,
    },
    cleaned: true,
    merged: true,
  })
  expect(sourceTask.result?.handoff?.git?.lifecycle).toMatchObject({
    review: {
      passed: true,
      at: '2026-04-01T03:21:30.000Z',
      sha: reviewSha,
    },
    cleaned: true,
    merged: true,
  })
  expect(sourceTask.git?.lifecycle).not.toHaveProperty('mergedAt')
  expect(sourceTask.git?.lifecycle).not.toHaveProperty('cleanedAt')
  expect(sourceTask.result?.handoff?.git?.lifecycle).not.toHaveProperty(
    'mergedAt',
  )
  expect(sourceTask.result?.handoff?.git?.lifecycle).not.toHaveProperty(
    'cleanedAt',
  )
})
