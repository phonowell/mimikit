import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/work/focus/constants.js'
import { applyTaskActions } from '../src/policy/manager/action-apply.js'
import {
  appendTaskResultArchive,
  readTaskResultArchive,
} from '../src/persistence/storage/task-results.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const TASK_CWD = '/tmp/manager-action-apply-task-git'
const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-git-review-'))

test('mutate_task can explicitly record review_passed -> merged -> cleaned on done git task', async () => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.tasks.push({
    id: 'task-git-close',
    fingerprint: 'task-git-close',
    prompt: 'close git lifecycle',
    title: 'Close Git Lifecycle',
    cwd: TASK_CWD,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'succeeded',
    createdAt: '2026-03-23T00:00:00.000Z',
    completedAt: '2026-03-23T00:10:00.000Z',
    git: {
      worktreePath: TASK_CWD,
      branch: 'feature/task-git-close',
    },
  })

  await applyTaskActions(runtime, [
    {
      name: 'mutate_task',
      attrs: {
        id: 'task-git-close',
        op: 'review_passed',
        sha: 'abc123',
      },
    },
    { name: 'mutate_task', attrs: { id: 'task-git-close', op: 'merged' } },
    { name: 'mutate_task', attrs: { id: 'task-git-close', op: 'cleaned' } },
  ])

  expect(runtime.tasks[0]?.git?.lifecycle).toMatchObject({
    review: { passed: true, sha: 'abc123' },
    merged: true,
    cleaned: true,
  })
  expect(runtime.tasks[0]?.git?.lifecycle?.review.at).toBeTypeOf('string')
  expect(runtime.tasks[0]?.git?.lifecycle?.mergedAt).toBeTypeOf('string')
  expect(runtime.tasks[0]?.git?.lifecycle?.cleanedAt).toBeTypeOf('string')
})

test('mutate_task git lifecycle syncs task.result handoff and archive frontmatter', async () => {
  const stateDir = await createTmpDir()
  const archivePath = await appendTaskResultArchive(stateDir, {
    taskId: 'task-git-sync',
    focusId: GLOBAL_FOCUS_ID,
    title: 'Sync Git Lifecycle',
    status: 'succeeded',
    taskStatus: 'succeeded',
    prompt: 'ship release',
    output: 'final output',
    createdAt: '2026-03-23T00:00:00.000Z',
    completedAt: '2026-03-23T00:10:00.000Z',
    durationMs: 10,
    provider: 'codex',
    handoff: { summary: 'Release shipped' },
  })
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    pausedQueue: true,
  })
  runtime.tasks.push({
    id: 'task-git-sync',
    fingerprint: 'task-git-sync',
    prompt: 'ship release',
    title: 'Sync Git Lifecycle',
    cwd: TASK_CWD,
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'succeeded',
    createdAt: '2026-03-23T00:00:00.000Z',
    completedAt: '2026-03-23T00:10:00.000Z',
    archivePath,
    git: {
      worktreePath: TASK_CWD,
      branch: 'feature/task-git-sync',
    },
    result: {
      taskId: 'task-git-sync',
      status: 'succeeded',
      ok: true,
      output: 'summary output',
      durationMs: 10,
      completedAt: '2026-03-23T00:10:00.000Z',
      archivePath,
      handoff: { summary: 'Release shipped' },
    },
  })

  await applyTaskActions(runtime, [
    {
      name: 'mutate_task',
      attrs: {
        id: 'task-git-sync',
        op: 'review_passed',
        sha: 'abc123',
        reason: '把这条任务标记为 review 已通过',
      },
    },
  ])

  expect(runtime.tasks[0]?.result?.handoff?.git?.lifecycle).toMatchObject({
    review: { passed: true, sha: 'abc123' },
  })
  const archived = await readTaskResultArchive(archivePath)
  expect(archived?.handoff?.git?.lifecycle).toMatchObject({
    review: { passed: true, sha: 'abc123' },
  })
  expect(archived?.output).toBe('final output')
})
