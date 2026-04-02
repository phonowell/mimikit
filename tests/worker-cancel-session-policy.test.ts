import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import { cancelTask } from '../src/execution/worker/cancel-task.js'
import { consumeWorkerResults } from '../src/kernel/streams/queues.js'

import { materializeTaskFixture } from './helpers/execution-spec.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { Task } from '../src/foundation/types/index.js'
import type { RuntimeState } from '../src/kernel/orchestrator/runtime-state.js'

const tempDirs: string[] = []

const createTmpDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mimikit-cancel-session-'))
  tempDirs.push(dir)
  return dir
}

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir,
    runtimeId: 'runtime-cancel-session-test',
    withGlobalFocus: false,
  })
  const queue: RuntimeState['process']['worker']['queue'] = {
    add: () => Promise.resolve(undefined),
    clear: () => undefined,
    pause: () => undefined,
    sizeBy: () => 0,
  }
  runtime.process.worker.queue = queue
  return runtime
}

const createPendingTask = (
  stateDir: string,
  id: string,
  overrides: Partial<Task> = {},
): Promise<Task> =>
  materializeTaskFixture({
    stateDir,
    task: {
      id,
      prompt: 'cancel me',
      title: 'Cancel me',
      focusId: 'focus-global',
      profile: 'worker',
      provider: 'codex',
      status: 'pending',
      createdAt: '2026-03-06T00:00:00.000Z',
      ...overrides,
    },
  })

afterEach(async () => {
  for (const dir of tempDirs.splice(0, tempDirs.length))
    await rm(dir, { recursive: true, force: true })
})

test('cancelTask keeps session reusable for deferred cancel source', async () => {
  const runtime = await createRuntime()
  const task = await createPendingTask(
    runtime.config.workDir,
    'task-deferred-cancel',
    {
      sessionId: 'session-keep',
      sessionState: 'reusable',
    },
  )
  runtime.domain.tasks = [task]

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
  expect(task.archivePath).toMatch(/task-deferred-cancel/i)

  const packets = await consumeWorkerResults({
    paths: runtime.paths,
    fromCursor: 0,
  })
  expect(packets).toHaveLength(1)
  expect(packets[0]?.payload.cancel?.source).toBe('deferred')
})

test('cancelTask discards session for user cancel source', async () => {
  const runtime = await createRuntime()
  const task = await createPendingTask(
    runtime.config.workDir,
    'task-user-cancel',
    {
      sessionId: 'session-discard',
      sessionState: 'reusable',
    },
  )
  runtime.domain.tasks = [task]

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
  expect(task.archivePath).toMatch(/task-user-cancel/i)

  const packets = await consumeWorkerResults({
    paths: runtime.paths,
    fromCursor: 0,
  })
  expect(packets).toHaveLength(1)
  expect(packets[0]?.payload.cancel?.source).toBe('user')
})

test('cancelTask keeps system source and returns trace fields', async () => {
  const runtime = await createRuntime()
  const task = await createPendingTask(
    runtime.config.workDir,
    'task-system-cancel',
    {
      sessionId: 'session-system',
      sessionState: 'reusable',
    },
  )
  runtime.domain.tasks = [task]

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
