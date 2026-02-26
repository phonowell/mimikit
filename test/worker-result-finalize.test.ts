import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { readTaskProgress } from '../src/storage/task-progress.js'
import type { Task, TaskResult } from '../src/types/index.js'
import { finalizeResult } from '../src/worker/result-finalize.js'

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
    focusId: 'focus-global',
    profile: 'worker',
    status: 'running',
    createdAt: '2026-02-26T10:00:00.000Z',
    startedAt: '2026-02-26T10:00:01.000Z',
    cancel: { source: 'deferred' },
  }
  const runtime = {
    config: { workDir: stateDir },
    paths: buildPaths(stateDir),
    tasks: [task],
    lastWorkerActivityAtMs: 0,
    managerWakePending: false,
    managerSignalController: new AbortController(),
    uiWakePending: false,
    uiWakeKind: null,
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

  const progress = await readTaskProgress(stateDir, task.id)
  expect(progress).toHaveLength(1)
  expect(progress[0]?.type).toBe('worker_end')
  expect(progress[0]?.payload).toMatchObject({
    status: 'canceled',
    durationMs: 12,
    cancel: { source: 'deferred' },
  })
})
