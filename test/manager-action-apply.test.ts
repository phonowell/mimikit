import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { applyTaskActions } from '../src/manager/action-apply.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-action-apply-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
  queue.pause()

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
    cronJobs: [],
    idleIntents: [],
    idleIntentArchive: [],
    managerTurn: 0,
    uiStream: null,
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakePending: false,
    uiWakeKind: null,
    uiSignalController: new AbortController(),
  }
}

test('create_task re-enqueues pending task when fingerprint matches exactly', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    profile: 'worker',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'same prompt',
        title: 'old title',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.id).toBe('task-pending')
  expect(runtime.workerQueue.size).toBe(1)
})

test('create_task dedupe does not block task creation when fingerprint differs', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    profile: 'worker',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'same prompt',
        title: 'new title',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[1]?.title).toBe('new title')
  expect(runtime.tasks[1]?.fingerprint).not.toBe(runtime.tasks[0]?.fingerprint)
})

test('create_task rejects forbidden .mimikit state paths', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl and summarize',
        title: 'forbidden',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(0)
})

test('create_task allows .mimikit/generated path', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'Write report to .mimikit/generated',
        title: 'allowed',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.title).toBe('allowed')
})

test('create_task uses worker profile for scheduled task', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'Summarize daily build status',
        title: 'scheduled',
        cron: '0 0 9 * * *',
      },
    },
  ])

  expect(runtime.cronJobs).toHaveLength(1)
  expect(runtime.cronJobs[0]?.profile).toBe('worker')
})

test('intent actions can create and archive done intent', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_intent',
      attrs: {
        prompt: 'remember release note',
        title: 'release note',
        priority: 'high',
      },
    },
  ])
  const createdId = runtime.idleIntents[0]?.id
  expect(createdId).toBeTruthy()
  await applyTaskActions(runtime, [
    {
      name: 'update_intent',
      attrs: {
        id: createdId ?? '',
        status: 'done',
      },
    },
  ])
  expect(runtime.idleIntents).toHaveLength(0)
  expect(runtime.idleIntentArchive).toHaveLength(1)
  expect(runtime.idleIntentArchive[0]?.status).toBe('done')
})

test('delete_intent keeps done archive item unchanged', async () => {
  const runtime = await createRuntime()
  runtime.idleIntentArchive.push({
    id: 'intent-done',
    prompt: 'done prompt',
    title: 'done',
    priority: 'normal',
    status: 'done',
    source: 'user_request',
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    archivedAt: '2026-02-13T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 2,
  })

  await applyTaskActions(runtime, [
    {
      name: 'delete_intent',
      attrs: {
        id: 'intent-done',
      },
    },
  ])

  expect(runtime.idleIntentArchive).toHaveLength(1)
  expect(runtime.idleIntentArchive[0]?.id).toBe('intent-done')
})
