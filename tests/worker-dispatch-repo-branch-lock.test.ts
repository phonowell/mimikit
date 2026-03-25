import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { enqueuePendingWorkerTasks } from '../src/execution/worker/dispatch.js'
import { materializeTaskFixture } from './helpers/execution-spec.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'
import type { Task } from '../src/foundation/types/index.js'
import type { WorkerLlmResult } from '../src/execution/worker/run-retry.js'

const { runTaskWithRetryMock } = vi.hoisted(() => ({
  runTaskWithRetryMock: vi.fn(),
}))

vi.mock('../src/execution/worker/run-retry.js', () => ({
  runTaskWithRetry: runTaskWithRetryMock,
}))

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-worker-dispatch-repo-'))
  tempDirs.push(dir)
  return dir
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    maxConcurrent: 2,
  })
  runtime.config.worker.maxConcurrent = 2
  runtime.worker.queue = new PQueue({
    concurrency: runtime.config.worker.maxConcurrent,
  })
  return runtime
}

const createTask = (stateDir: string, id: string, branch: string): Promise<Task> =>
  materializeTaskFixture({
    stateDir,
    task: {
      id,
      prompt: `prompt-${id}`,
      title: `task ${id}`,
      cwd: `/tmp/${id}`,
      repoKey: '/tmp/shared-repo/.git',
      branch,
      focusId: 'focus-global',
      profile: 'worker',
      provider: 'codex',
      status: 'pending',
      createdAt: '2026-03-10T00:00:00.000Z',
    },
  })

beforeEach(() => {
  runTaskWithRetryMock.mockReset()
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('worker dispatch serializes tasks on the same repo and branch', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push(
    await createTask(runtime.config.workDir, 'task-main-a', 'main'),
    await createTask(runtime.config.workDir, 'task-main-b', 'main'),
  )

  let running = 0
  let maxRunning = 0
  runTaskWithRetryMock.mockImplementation(
    async (): Promise<WorkerLlmResult> => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await sleep(40)
      running = Math.max(0, running - 1)
      return { output: 'done', elapsedMs: 40 }
    },
  )

  for (let round = 0; round < 6; round += 1) {
    enqueuePendingWorkerTasks(runtime)
    await runtime.worker.queue.onIdle()
    if (runtime.tasks.every((task) => task.status === 'succeeded')) break
  }

  expect(runtime.tasks.map((task) => task.status)).toEqual([
    'succeeded',
    'succeeded',
  ])
  expect(maxRunning).toBe(1)
})

test('worker dispatch keeps different branches parallel when slots are free', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push(
    await createTask(runtime.config.workDir, 'task-worktree-1', 'worktree-1'),
    await createTask(runtime.config.workDir, 'task-worktree-2', 'worktree-2'),
  )

  let running = 0
  let maxRunning = 0
  runTaskWithRetryMock.mockImplementation(
    async (): Promise<WorkerLlmResult> => {
      running += 1
      maxRunning = Math.max(maxRunning, running)
      await sleep(40)
      running = Math.max(0, running - 1)
      return { output: 'done', elapsedMs: 40 }
    },
  )

  for (let round = 0; round < 4; round += 1) {
    enqueuePendingWorkerTasks(runtime)
    await runtime.worker.queue.onIdle()
    if (runtime.tasks.every((task) => task.status === 'succeeded')) break
  }

  expect(runtime.tasks.map((task) => task.status)).toEqual([
    'succeeded',
    'succeeded',
  ])
  expect(maxRunning).toBe(2)
})
