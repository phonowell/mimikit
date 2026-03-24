import { expect, test } from 'vitest'

import { finalizeResult } from '../../src/execution/worker/result-finalize.js'
import { readTaskResultArchive } from '../../src/persistence/storage/task-results.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'
import { readTaskProgressForTest } from '../helpers/task-progress.js'

import { createTmpDir, mergeTaskPatch, readWorkerEndLog } from './testkit.js'

import type { Task, TaskResult } from '../../src/foundation/types/index.js'

test('finalizeResult appends worker_end progress for canceled task', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-1',
    fingerprint: 'task-1',
    prompt: 'cancel me',
    title: 'Cancel Me',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
    startedAt: '2026-02-26T10:00:01.000Z',
    cancel: { source: 'deferred' },
    contract: {
      goal: 'Cancel task safely',
      scope: 'Cancel flow',
      acceptance: ['Task is marked canceled'],
    },
  }
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    patch: {
      tasks: [task],
      focuses: [
        {
          id: 'focus-global',
          title: 'Global',
          status: 'active',
          createdAt: '2026-02-26T10:00:00.000Z',
          updatedAt: '2026-02-26T10:00:00.000Z',
          lastActivityAt: '2026-02-26T10:00:00.000Z',
        },
        {
          id: 'focus-local',
          title: 'Local',
          status: 'active',
          createdAt: '2026-02-26T10:00:00.000Z',
          updatedAt: '2026-02-26T10:00:00.000Z',
          lastActivityAt: '2026-02-26T10:00:00.000Z',
        },
      ],
    },
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'canceled',
    ok: false,
    output: 'Task canceled',
    durationMs: 12,
    completedAt: '2026-02-26T10:00:13.000Z',
    cancel: { source: 'deferred' },
  }

  await finalizeResult(runtime, task, result, mergeTaskPatch)

  await expect
    .poll(() => readWorkerEndLog(runtime, task.id), { timeout: 1_000 })
    .toMatchObject({ usageCaptured: false })

  const progress = await readTaskProgressForTest(stateDir, task.id)
  expect(progress).toHaveLength(1)
  expect(progress[0]?.type).toBe('worker_end')
  expect(progress[0]?.payload).toMatchObject({
    status: 'canceled',
    durationMs: 12,
    cancel: { source: 'deferred' },
  })
  expect(
    runtime.focuses.find((focus) => focus.id === 'focus-local')?.summary,
  ).toContain('Task canceled')
  expect(result.handoff?.summary).toContain('Task canceled')
  expect(result.evidence?.contractGoal).toBe('Cancel task safely')
  expect(result.evidence?.stateDelta.taskStatusTo).toBe('canceled')
  expect(result.evidence?.acceptanceChecks[0]?.criterion).toBe(
    'Task is marked canceled',
  )
  expect(result.handoff?.evidence?.[0]).toMatchObject({
    type: 'task_archive',
  })
  expect(result.handoff?.artifacts?.[0]).toMatchObject({
    kind: 'task_archive',
  })
  const archived = await readTaskResultArchive(result.archivePath ?? '')
  expect(archived?.provider).toBe('codex')
  expect(archived?.handoff?.evidence?.[0]).toMatchObject({
    type: 'task_archive',
  })
  expect(archived?.evidence).toMatchObject({
    contractGoal: 'Cancel task safely',
    stateDelta: {
      taskStatusTo: 'canceled',
    },
  })
  const succeeded: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'Done without checklist',
    durationMs: 20,
    completedAt: '2026-02-26T10:00:33.000Z',
  }
  await finalizeResult(runtime, task, succeeded, mergeTaskPatch)
})

test('finalizeResult marks usageCaptured=true for canceled result with usage', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-usage',
    fingerprint: 'task-usage',
    prompt: 'cancel with usage',
    title: 'Cancel With Usage',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
  }
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: {
      tasks: [task],
      focuses: [
        {
          id: 'focus-local',
          title: 'Local',
          status: 'active',
          createdAt: '2026-02-26T10:00:00.000Z',
          updatedAt: '2026-02-26T10:00:00.000Z',
          lastActivityAt: '2026-02-26T10:00:00.000Z',
        },
      ],
    },
  })
  const result: TaskResult = {
    taskId: task.id,
    status: 'canceled',
    ok: false,
    output: 'Task canceled',
    durationMs: 10,
    completedAt: '2026-02-26T10:00:10.000Z',
    cancel: { source: 'system' },
    usage: { input: 12, output: 3, total: 15 },
  }

  await finalizeResult(runtime, task, result, mergeTaskPatch)

  await expect
    .poll(() => readWorkerEndLog(runtime, task.id), { timeout: 1_000 })
    .toMatchObject({ usageCaptured: true })
})
