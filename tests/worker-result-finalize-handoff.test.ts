import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { finalizeResult } from '../src/execution/worker/result-finalize.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { Task, TaskResult } from '../src/foundation/types/index.js'

const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-finalize-result-handoff-'))

const mergeTaskPatch = (
  tasks: Task[],
  taskId: string,
  patch?: Partial<Task>,
): void => {
  if (!patch) return
  const task = tasks.find((item) => item.id === taskId)
  if (!task) return
  Object.assign(task, patch)
}

test('finalizeResult keeps repo-local git reconcile as the handoff truth source', async () => {
  const stateDir = await createTmpDir()
  const missingWorktreePath = join(stateDir, 'missing-worktree')
  const task: Task = {
    id: 'task-structured-handoff',
    fingerprint: 'task-structured-handoff',
    prompt: 'ship release',
    title: 'Ship Release',
    cwd: '/tmp/ship-release',
    repoKey: join(stateDir, '.git'),
    branch: 'feature/release',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
    git: {
      worktreePath: missingWorktreePath,
      branch: 'feature/release',
      closureRequired: true,
    },
  }
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: { tasks: [task] },
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'Release completed.',
    handoff: {
      summary: 'Release shipped',
      decisions: ['Enabled feature flag'],
      nextSteps: ['Monitor rollout'],
      git: {
        worktreePath: missingWorktreePath,
        branch: 'feature/release',
        closureRequired: true,
        lifecycle: {
          review: { passed: true, sha: 'abc123' },
          merged: true,
          cleaned: false,
        },
      },
    },
    durationMs: 15,
    completedAt: '2026-02-26T10:00:15.000Z',
  }

  await finalizeResult(runtime, task, result, mergeTaskPatch)

  expect(result.output).toBe('Release completed.')
  expect(result.handoff?.summary).toBe('Release shipped')
  expect(result.handoff?.decisions).toEqual(['Enabled feature flag'])
  expect(result.handoff?.nextSteps).toEqual([
    'Monitor rollout',
    '在主仓完成 feature/release 的 merge/cleanup 收尾',
    '收尾后回写 git closure 真相并复核归档',
  ])
  expect(result.handoff?.git?.lifecycle).toMatchObject({
    review: { passed: false },
    merged: false,
    cleaned: true,
  })
})

test('finalizeResult does not infer success handoff fields from free text without structured handoff', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-success-no-handoff',
    fingerprint: 'task-success-no-handoff',
    prompt: 'ship release',
    title: 'Ship Release',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
  }
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: { tasks: [task] },
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: ['Release completed.', '- [x] Enabled feature flag'].join('\n'),
    durationMs: 15,
    completedAt: '2026-02-26T10:00:15.000Z',
  }

  await finalizeResult(runtime, task, result, mergeTaskPatch)

  expect(result.handoff).toEqual({
    artifacts: [{ path: result.archivePath ?? '', kind: 'task_archive' }],
    evidence: [{ type: 'task_archive', ref: result.archivePath ?? '' }],
  })
})
