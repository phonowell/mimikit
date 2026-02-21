import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
import * as opencodeSession from '../src/providers/opencode-session.js'
import { buildProviderAbortedError } from '../src/providers/provider-error.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

vi.mock('../src/providers/opencode-session.js', () => ({
  summarizeOpencodeSession: vi.fn(),
}))

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-action-apply-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
  queue.pause()

  return {
    config,
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [],
    cronJobs: [],
    managerTurn: 0,
    uiStream: null,
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakePending: false,
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
    profile: 'standard',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'same prompt',
        title: 'old title',
        profile: 'standard',
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
    profile: 'standard',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'same prompt',
        title: 'new title',
        profile: 'standard',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[1]?.title).toBe('new title')
  expect(runtime.tasks[1]?.fingerprint).not.toBe(runtime.tasks[0]?.fingerprint)
})

test('create_task rejects scheduled worker-profile task', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'scheduled with profile',
        title: 'invalid',
        profile: 'standard',
        cron: '0 0 9 * * *',
      },
    },
  ])

  expect(runtime.cronJobs).toHaveLength(0)
})

test('create_task rejects forbidden .mimikit state paths for worker profiles', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl and summarize',
        title: 'forbidden',
        profile: 'standard',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(0)
})

test('create_task allows .mimikit/generated path for worker profiles', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'Write report to .mimikit/generated',
        title: 'allowed',
        profile: 'standard',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.title).toBe('allowed')
})

test('create_task infers deferred profile for scheduled history task', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl and summarize',
        title: 'scheduled',
        cron: '0 0 9 * * *',
      },
    },
  ])

  expect(runtime.cronJobs).toHaveLength(1)
  expect(runtime.cronJobs[0]?.profile).toBe('deferred')
})

test('compress_context summarizes planner session when provider succeeds', async () => {
  const runtime = await createRuntime()
  runtime.plannerSessionId = 'planner-session-1'
  const summarizeSpy = vi.mocked(opencodeSession.summarizeOpencodeSession)
  summarizeSpy.mockReset()
  summarizeSpy.mockResolvedValue(undefined)

  await expect(
    applyTaskActions(runtime, [
      {
        name: 'compress_context',
        attrs: {},
      },
    ]),
  ).resolves.toBeUndefined()
})

test('compress_context ignores provider aborted errors', async () => {
  const runtime = await createRuntime()
  runtime.plannerSessionId = 'planner-session-1'
  const summarizeSpy = vi.mocked(opencodeSession.summarizeOpencodeSession)
  summarizeSpy.mockReset()
  summarizeSpy.mockRejectedValue(buildProviderAbortedError('opencode'))

  await expect(
    applyTaskActions(runtime, [
      {
        name: 'compress_context',
        attrs: {},
      },
    ]),
  ).resolves.toBeUndefined()
})
