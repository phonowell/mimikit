import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { addUserInput } from '../src/orchestrator/core/orchestrator-runtime-ops.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import { consumeUserInputs } from '../src/streams/queues.js'

const GLOBAL_FOCUS_ID = 'focus-global'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-ops-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
  queue.pause()
  const now = new Date().toISOString()
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
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [],
    taskPlans: [],
    focuses: [
      {
        id: GLOBAL_FOCUS_ID,
        title: 'Global',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
      {
        id: 'focus-choice',
        title: 'Choice',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
    ],
    focusContexts: [],
    activeFocusIds: [GLOBAL_FOCUS_ID, 'focus-choice'],
    managerTurn: 0,
    memoryRefresh: {
      lastCompletedTurn: 0,
      lastProcessedInputsCursor: 0,
      lastProcessedResultsCursor: 0,
      running: false,
      pending: false,
    },
    managerFocusCompressedContexts: [],
    uiStream: null,
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: {
      id: 'choice-delivery',
      question: 'Choose output format',
      options: [
        {
          id: 'option-report',
          label: 'Report',
          reason: 'Need details',
        },
        {
          id: 'option-checklist',
          label: 'Checklist',
          reason: 'Need speed',
        },
      ],
      defaultOptionId: 'option-report',
      createdAt: '2026-03-01T00:00:00.000Z',
      expiresAt: '2026-03-01T00:05:00.000Z',
      focusId: 'focus-choice',
    },
  }
}

test('addUserInput cancels pending user choice when user sends a new message', async () => {
  const runtime = await createRuntime()

  await addUserInput(runtime, 'continue with a different request')

  expect(runtime.pendingUserChoice).toBeNull()
  expect(runtime.inflightInputs).toHaveLength(2)
  const packets = await consumeUserInputs({
    paths: runtime.paths,
    fromCursor: 0,
  })
  expect(packets).toHaveLength(2)
  const first = packets[0]?.payload
  const second = packets[1]?.payload
  expect(first).toMatchObject({
    role: 'user',
    text: 'continue with a different request',
  })
  expect(second).toMatchObject({
    role: 'system',
    visibility: 'all',
    focusId: 'focus-choice',
  })
  if (second?.role === 'system') {
    expect(second.text).toContain('user_choice_skipped')
    expect(second.text).toContain('"choice_id":"choice-delivery"')
  }
})
