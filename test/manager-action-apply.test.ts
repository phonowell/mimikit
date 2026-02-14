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
    config,
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [],
    cronJobs: [],
    uiStream: null,
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiSignalController: new AbortController(),
  }
}

test('create_task dedupe only applies to same fingerprint and still re-enqueues pending task', async () => {
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

test('create_task rejects forbidden .mimikit state paths for worker profiles', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'create_task',
      attrs: {
        prompt: 'Read .mimikit/tasks/task-1.json and summarize',
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
