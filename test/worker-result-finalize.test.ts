import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { readTaskResultArchive } from '../src/storage/task-results.js'
import type { Task, TaskResult } from '../src/types/index.js'
import { finalizeResult } from '../src/worker/result-finalize.js'
import { readTaskProgressForTest } from './helpers/task-progress.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-finalize-result-'))

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

test('finalizeResult appends worker_end progress for canceled task', async () => {
  const stateDir = await createTmpDir()
  const task: Task = {
    id: 'task-1',
    fingerprint: 'task-1',
    prompt: 'cancel me',
    title: 'Cancel Me',
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'opencode',
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
  const runtime = {
    config: { workDir: stateDir },
    paths: buildPaths(stateDir),
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
    focusContexts: [],
    activeFocusIds: ['focus-global', 'focus-local'],
    lastWorkerActivityAtMs: 0,
    managerWakePending: false,
    managerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
  } as unknown as RuntimeState
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

  const progress = await readTaskProgressForTest(stateDir, task.id)
  expect(progress).toHaveLength(1)
  expect(progress[0]?.type).toBe('worker_end')
  expect(progress[0]?.payload).toMatchObject({
    status: 'canceled',
    durationMs: 12,
    cancel: { source: 'deferred' },
  })
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
  expect(archived?.provider).toBe('opencode')
  expect(archived?.handoff?.evidence?.[0]).toMatchObject({
    type: 'task_archive',
  })
  expect(runtime.focusContexts).toHaveLength(1)
  expect(runtime.focusContexts[0]).toMatchObject({
    focusId: 'focus-local',
  })
  expect(runtime.focusContexts[0]?.summary).toContain('Cancel Me')
  expect(runtime.focusContexts[0]?.openItems?.[0]).toContain('Resume')

  const succeeded: TaskResult = {
    taskId: task.id,
    status: 'succeeded',
    ok: true,
    output: 'Done without checklist',
    durationMs: 20,
    completedAt: '2026-02-26T10:00:33.000Z',
  }
  await finalizeResult(runtime, task, succeeded, mergeTaskPatch)
  expect(runtime.focusContexts[0]?.openItems?.[0]).toContain('Resume')
})
