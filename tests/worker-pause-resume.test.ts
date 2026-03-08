import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { readHistory } from '../src/history/store.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { parseSystemEventText } from '../src/shared/system-event.js'
import type { Task } from '../src/types/index.js'
import { pauseTask } from '../src/worker/pause-task.js'
import { resumeTask } from '../src/worker/resume-task.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-pause-resume-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (params?: {
  queue?: Partial<RuntimeState['workerQueue']>
}): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  return {
    runtimeId: 'runtime-pause-resume-test',
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
    focuses: [],
    focusContexts: [],
    activeFocusIds: [],
    managerTurn: 0,
    memoryRefresh: {
      lastCompletedTurn: 0,
      lastProcessedInputsCursor: 0,
      lastProcessedResultsCursor: 0,
      running: false,
      pending: false,
    },
    managerFocusCompressedContexts: [],
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: {
      add: async () => undefined,
      clear: () => undefined,
      pause: () => undefined,
      sizeBy: () => 0,
      ...params?.queue,
    } as RuntimeState['workerQueue'],
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

const createTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'run task',
  title: 'Run Task',
  focusId: 'focus-global',
  profile: 'worker',
  status: 'pending',
  createdAt: '2026-03-06T00:00:00.000Z',
  ...overrides,
})

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('pauseTask marks pending task as paused and writes task_paused event', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-pause-pending')
  runtime.tasks = [task]

  const result = await pauseTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'paused',
  })
  expect(task.status).toBe('paused')
  expect(task.pausedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  const history = await readHistory(runtime.paths.history)
  const event = history
    .map((item) => parseSystemEventText(item.text))
    .find((item) => item.name === 'task_paused')
  expect(event?.payload?.task_id).toBe(task.id)
})

test('pauseTask aborts running controller', async () => {
  const runtime = await createRuntime()
  const task = createTask('task-pause-running', {
    status: 'running',
    startedAt: '2026-03-06T00:00:02.000Z',
  })
  runtime.tasks = [task]
  const controller = new AbortController()
  runtime.runningControllers.set(task.id, controller)

  const result = await pauseTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'paused',
  })
  expect(controller.signal.aborted).toBe(true)
  expect(task.status).toBe('paused')
})

test('resumeTask re-queues paused task and writes task_resumed event', async () => {
  const queueAdd = vi.fn(async () => undefined)
  const runtime = await createRuntime({
    queue: {
      add: queueAdd as RuntimeState['workerQueue']['add'],
      sizeBy: () => 0,
    },
  })
  const task = createTask('task-resume', {
    status: 'paused',
    pausedAt: '2026-03-06T00:00:03.000Z',
  })
  runtime.tasks = [task]

  const result = await resumeTask(runtime, task.id, { source: 'user' })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'pending',
  })
  expect(task.status).toBe('pending')
  expect(task.pausedAt).toBeUndefined()
  expect(queueAdd).toHaveBeenCalledTimes(1)
  const history = await readHistory(runtime.paths.history)
  const event = history
    .map((item) => parseSystemEventText(item.text))
    .find((item) => item.name === 'task_resumed')
  expect(event?.payload?.task_id).toBe(task.id)
})
