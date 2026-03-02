import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { enqueuePendingWorkerTasks } from '../src/worker/dispatch.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { Task } from '../src/types/index.js'
import type { WorkerLlmResult } from '../src/worker/run-retry.js'

const { runTaskWithRetryMock } = vi.hoisted(() => ({
  runTaskWithRetryMock: vi.fn(),
}))

vi.mock('../src/worker/run-retry.js', () => ({
  runTaskWithRetry: runTaskWithRetryMock,
}))

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-worker-dispatch-focus-'))
  tempDirs.push(dir)
  return dir
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  config.worker.maxConcurrent = 2
  const now = '2026-03-02T00:00:00.000Z'
  return {
    runtimeId: 'runtime-test',
    config,
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    lastManagerActivityAtMs: Date.now(),
    lastWorkerActivityAtMs: Date.now(),
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [],
    taskPlans: [],
    focuses: [
      {
        id: 'focus-global',
        title: 'Global',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
      {
        id: 'focus-a',
        title: 'Focus A',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
      {
        id: 'focus-b',
        title: 'Focus B',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
    ],
    focusContexts: [],
    activeFocusIds: ['focus-global', 'focus-a', 'focus-b'],
    managerTurn: 0,
    memoryRefresh: {
      lastCompletedTurn: 0,
      lastProcessedInputsCursor: 0,
      lastProcessedResultsCursor: 0,
      running: false,
      pending: false,
    },
    uiStream: null,
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: new PQueue({ concurrency: config.worker.maxConcurrent }),
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
  }
}

const createTask = (id: string, focusId: string): Task => ({
  id,
  fingerprint: id,
  prompt: `prompt-${id}`,
  title: `task ${id}`,
  focusId,
  profile: 'worker',
  status: 'pending',
  createdAt: '2026-03-02T00:00:00.000Z',
})

beforeEach(() => {
  runTaskWithRetryMock.mockReset()
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    await rm(dir, { recursive: true, force: true })
  }
})

test('worker dispatch serializes tasks in the same focus', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push(
    createTask('task-a1', 'focus-a'),
    createTask('task-a2', 'focus-a'),
  )

  let globalRunning = 0
  let maxGlobalRunning = 0
  const runningByFocus = new Map<string, number>()
  const maxByFocus = new Map<string, number>()

  runTaskWithRetryMock.mockImplementation(
    async ({ task }: { task: Task }): Promise<WorkerLlmResult> => {
      globalRunning += 1
      if (globalRunning > maxGlobalRunning) maxGlobalRunning = globalRunning
      const nextFocusRunning = (runningByFocus.get(task.focusId) ?? 0) + 1
      runningByFocus.set(task.focusId, nextFocusRunning)
      const currentMaxFocus = maxByFocus.get(task.focusId) ?? 0
      if (nextFocusRunning > currentMaxFocus)
        maxByFocus.set(task.focusId, nextFocusRunning)
      await sleep(40)
      const current = runningByFocus.get(task.focusId) ?? 0
      runningByFocus.set(task.focusId, Math.max(0, current - 1))
      globalRunning = Math.max(0, globalRunning - 1)
      return {
        output: `done ${task.id}`,
        elapsedMs: 40,
      }
    },
  )

  for (let round = 0; round < 4; round += 1) {
    enqueuePendingWorkerTasks(runtime)
    await runtime.workerQueue.onIdle()
    if (
      runtime.tasks.every(
        (task) =>
          task.status === 'succeeded' ||
          task.status === 'failed' ||
          task.status === 'canceled',
      )
    )
      break
  }

  expect(runtime.tasks.map((task) => task.status)).toEqual([
    'succeeded',
    'succeeded',
  ])
  expect(maxByFocus.get('focus-a')).toBe(1)
  expect(maxGlobalRunning).toBe(1)
})
