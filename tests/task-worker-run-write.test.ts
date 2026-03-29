import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { loadRuntimeSnapshot } from '../src/persistence/storage/runtime-snapshot.js'
import {
  buildTaskFingerprint,
  buildTaskSemanticKey,
} from '../src/work/orchestrator/task-state.js'
import {
  finishTaskWorkerRun,
  startTaskWorkerRun,
  updateTaskUsage,
} from '../src/work/orchestrator/task-worker-run-write.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { Task } from '../src/foundation/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-task-worker-run-'))

const createTask = (): Task => ({
  id: 'task-run-write',
  fingerprint: buildTaskFingerprint({
    prompt: 'run task',
    title: 'Run Task',
    cwd: '/tmp/run-task',
    profile: 'worker',
    provider: 'codex',
    focusId: 'focus-local',
  }),
  semanticKey: buildTaskSemanticKey({
    prompt: 'run task',
    title: 'Run Task',
    cwd: '/tmp/run-task',
    profile: 'worker',
    provider: 'codex',
    focusId: 'focus-local',
  }),
  executionSpecId: 'spec-task-run-write',
  title: 'Run Task',
  cwd: '/tmp/run-task',
  focusId: 'focus-local',
  profile: 'worker',
  provider: 'codex',
  status: 'pending',
  createdAt: '2026-03-24T08:00:00.000Z',
})

test('startTaskWorkerRun and finishTaskWorkerRun own worker run state writes', async () => {
  const workDir = await createTmpDir()
  const task = createTask()
  const runtime = await createTestRuntimeState({
    workDir,
    withGlobalFocus: false,
    patch: { tasks: [task] },
  })
  const controller = new AbortController()
  const dispatchLockKey = 'dispatch-lock'

  await startTaskWorkerRun({
    runtime,
    task,
    dispatchLockKey,
    controller,
  })

  expect(task.status).toBe('running')
  expect(runtime.worker.runningControllers.get(task.id)).toBe(controller)
  expect(runtime.worker.runningTaskLocks.has(dispatchLockKey)).toBe(true)
  expect(runtime.ui.wakeVersion).toBe(1)

  const snapshot = await loadRuntimeSnapshot(workDir)
  expect(snapshot.tasks[0]?.id).toBe(task.id)
  expect(snapshot.tasks[0]?.status).toBe('running')

  await finishTaskWorkerRun({
    runtime,
    taskId: task.id,
    dispatchLockKey,
  })

  expect(runtime.worker.runningControllers.has(task.id)).toBe(false)
  expect(runtime.worker.runningTaskLocks.has(dispatchLockKey)).toBe(false)
  expect(runtime.manager.wakePending).toBe(true)
})

test('updateTaskUsage updates task usage and wakes task UI once per change', async () => {
  const workDir = await createTmpDir()
  const task = createTask()
  const runtime = await createTestRuntimeState({
    workDir,
    withGlobalFocus: false,
    patch: { tasks: [task] },
  })

  const firstChanged = updateTaskUsage(runtime, task, {
    input: 10,
    output: 4,
    total: 14,
  })
  const secondChanged = updateTaskUsage(runtime, task, {
    input: 10,
    output: 4,
    total: 14,
  })

  expect(firstChanged).toBe(true)
  expect(secondChanged).toBe(false)
  expect(task.usage).toEqual({ input: 10, output: 4, total: 14 })
  expect(runtime.ui.wakeVersion).toBe(1)
})
