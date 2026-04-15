import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { enqueuePendingWorkerTasks } from '../src/execution/worker/dispatch.js'

import { materializeTaskFixture } from './helpers/execution-spec.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { WorkerLlmResult } from '../src/execution/worker/run-retry.js'
import type { Task } from '../src/foundation/types/index.js'
import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

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
  runtime.process.worker.queue = new PQueue({
    concurrency: runtime.config.worker.maxConcurrent,
  })
  return runtime
}

const createTask = (
  stateDir: string,
  id: string,
  branch: string,
  resourceMode: Task['resourceMode'] = 'write',
): Promise<Task> =>
  materializeTaskFixture({
    stateDir,
    task: {
      id,
      prompt: `prompt-${id}`,
      title: `task ${id}`,
      cwd: `/tmp/${id}`,
      resourceMode,
      repoKey: '/tmp/shared-repo/.git',
      branch,
      focusId: 'focus-global',
      profile: 'worker',
      provider: 'codex',
      status: 'pending',
      createdAt: '2026-03-10T00:00:00.000Z',
    },
  })

const runDispatchScenario = async (params: {
  branches: string[]
  expectedMaxRunning: number
  rounds: number
  resourceMode?: Task['resourceMode']
}): Promise<void> => {
  const runtime = await createRuntime()
  for (const [index, branch] of params.branches.entries()) {
    runtime.domain.tasks.push(
      await createTask(
        runtime.config.workDir,
        `task-${index + 1}`,
        branch,
        params.resourceMode,
      ),
    )
  }

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

  for (let round = 0; round < params.rounds; round += 1) {
    enqueuePendingWorkerTasks(runtime)
    await runtime.process.worker.queue.onIdle()
    if (runtime.domain.tasks.every((task) => task.status === 'succeeded')) break
  }

  expect(runtime.domain.tasks.map((task) => task.status)).toEqual([
    'succeeded',
    'succeeded',
  ])
  expect(maxRunning).toBe(params.expectedMaxRunning)
}

beforeEach(() => {
  runTaskWithRetryMock.mockReset()
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('worker dispatch serializes tasks on the same repo and branch', async () => {
  await runDispatchScenario({
    branches: ['main', 'main'],
    expectedMaxRunning: 1,
    rounds: 6,
  })
})

test('worker dispatch keeps different branches parallel when slots are free', async () => {
  await runDispatchScenario({
    branches: ['worktree-1', 'worktree-2'],
    expectedMaxRunning: 2,
    rounds: 4,
  })
})

test('worker dispatch does not serialize read tasks behind the same repo branch lock', async () => {
  await runDispatchScenario({
    branches: ['main', 'main'],
    expectedMaxRunning: 2,
    rounds: 4,
    resourceMode: 'read',
  })
})
