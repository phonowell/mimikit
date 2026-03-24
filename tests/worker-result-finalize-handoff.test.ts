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

test('finalizeResult prefers structured worker handoff and strips protocol tags', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-structured-handoff',
    fingerprint: 'task-structured-handoff',
    prompt: 'ship release',
    title: 'Ship Release',
    cwd: '/tmp/ship-release',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
    git: {
      worktreePath: '/tmp/ship-release-worktree',
      branch: 'feature/release',
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
    output: [
      'Release completed.',
      '<M:task_handoff>{"summary":"Release shipped","decisions":["Enabled feature flag"],"next_steps":["Monitor rollout"],"git_lifecycle":{"review":{"passed":true,"sha":"abc123"},"merged":true,"cleaned":false}}</M:task_handoff>',
      '<M:skill_usage status="done">release-skill</M:skill_usage>',
    ].join('\n'),
    durationMs: 15,
    completedAt: '2026-02-26T10:00:15.000Z',
  }

  await finalizeResult(runtime, task, result, mergeTaskPatch)

  expect(result.output).toBe('Release completed.')
  expect(result.handoff?.summary).toBe('Release shipped')
  expect(result.handoff?.decisions).toEqual(['Enabled feature flag'])
  expect(result.handoff?.nextSteps).toEqual(['Monitor rollout'])
  expect(result.handoff?.git?.lifecycle).toMatchObject({
    review: {
      passed: true,
      sha: 'abc123',
    },
    merged: true,
    cleaned: true,
  })
})

test('finalizeResult does not infer success handoff fields from free text without task_handoff', async () => {
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
