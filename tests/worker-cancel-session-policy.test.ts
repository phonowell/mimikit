import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { consumeWorkerResults } from '../src/streams/queues.js'
import type { Task } from '../src/types/index.js'
import { cancelTask } from '../src/worker/cancel-task.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-cancel-session-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  return {
    runtimeId: 'runtime-cancel-session-test',
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
    } as RuntimeState['workerQueue'],
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

const createPendingTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  fingerprint: `fp-${id}`,
  prompt: 'cancel me',
  title: 'Cancel me',
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

test('cancelTask keeps session reusable for deferred cancel source', async () => {
  const runtime = await createRuntime()
  const task = createPendingTask('task-deferred-cancel', {
    sessionId: 'session-keep',
    sessionState: 'reusable',
  })
  runtime.tasks = [task]

  const result = await cancelTask(runtime, task.id, {
    source: 'deferred',
    reason: 'defer to follow-up plan',
  })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'canceled',
  })
  expect(result.changeAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  )
  expect(task.sessionId).toBe('session-keep')
  expect(task.sessionState).toBe('reusable')
  expect(task.cancel?.source).toBe('deferred')

  const packets = await consumeWorkerResults({
    paths: runtime.paths,
    fromCursor: 0,
  })
  expect(packets).toHaveLength(1)
  expect(packets[0]?.payload.cancel?.source).toBe('deferred')
})

test('cancelTask discards session for user cancel source', async () => {
  const runtime = await createRuntime()
  const task = createPendingTask('task-user-cancel', {
    sessionId: 'session-discard',
    sessionState: 'reusable',
  })
  runtime.tasks = [task]

  const result = await cancelTask(runtime, task.id, {
    source: 'user',
    reason: 'user clicked stop',
  })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'canceled',
  })
  expect(result.changeAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  )
  expect(task.sessionId).toBeUndefined()
  expect(task.sessionState).toBe('discarded')
  expect(task.cancel?.source).toBe('user')

  const packets = await consumeWorkerResults({
    paths: runtime.paths,
    fromCursor: 0,
  })
  expect(packets).toHaveLength(1)
  expect(packets[0]?.payload.cancel?.source).toBe('user')
})

test('cancelTask keeps system source and returns trace fields', async () => {
  const runtime = await createRuntime()
  const task = createPendingTask('task-system-cancel', {
    sessionId: 'session-system',
    sessionState: 'reusable',
  })
  runtime.tasks = [task]

  const result = await cancelTask(runtime, task.id, {
    source: 'system',
    reason: 'system cleanup',
  })

  expect(result).toMatchObject({
    ok: true,
    id: task.id,
    status: 'canceled',
  })
  expect(result.changeAt).toMatch(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
  )
  expect(task.cancel?.source).toBe('system')
})
