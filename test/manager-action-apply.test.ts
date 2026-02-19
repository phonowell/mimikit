import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { expireFocus, rollbackFocuses } from '../src/focus/state.js'
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
    managerWakePending: false,
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [],
    cronJobs: [],
    focuses: [],
    focusRollbackStack: [],
    managerTurn: 0,
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

  await applyTaskActions(
    runtime,
    [
      {
        name: 'sync_focuses',
        attrs: {},
        content: JSON.stringify({
          active: [
            {
              title: 'write report',
              summary: 'deliver generated report',
              confidence: 0.7,
              evidence_ids: ['input-1'],
            },
          ],
        }),
      },
    ],
    { focusEvidenceIds: new Set(['input-1']) },
  )

  expect(runtime.focuses).toHaveLength(1)
  expect(runtime.focuses[0]?.status).toBe('active')
  expect(runtime.focuses[0]?.title).toBe('write report')

  const focusId = runtime.focuses[0]?.id
  if (!focusId) throw new Error('focus id must exist')
  const snapshotBeforeDrift = JSON.stringify(runtime.focuses)

  await applyTaskActions(
    runtime,
    [
      {
        name: 'sync_focuses',
        attrs: {},
        content: JSON.stringify({
          active: [
            {
              id: focusId,
              title: 'totally different',
              summary: 'unrelated topic without shared evidence',
              confidence: 0.2,
              evidence_ids: ['other-evidence'],
            },
          ],
        }),
      },
    ],
    { focusEvidenceIds: new Set() },
  )

  expect(JSON.stringify(runtime.focuses)).toBe(snapshotBeforeDrift)

  const expired = expireFocus(runtime, focusId)
  expect(expired.ok).toBe(true)
  expect(runtime.focuses[0]?.status).toBe('expired')
  expect(rollbackFocuses(runtime)).toBe(true)
  expect(runtime.focuses[0]?.status).toBe('active')
})
