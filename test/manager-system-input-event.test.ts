import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { GLOBAL_FOCUS_ID } from '../src/focus/index.js'
import { buildPaths } from '../src/fs/paths.js'
import { publishManagerSystemEventInput } from '../src/manager/system-input-event.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-system-input-event-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
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
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
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
        id: 'focus-topic',
        title: 'Topic',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
    ],
    focusContexts: [],
    activeFocusIds: [GLOBAL_FOCUS_ID, 'focus-topic'],
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
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

test('publishManagerSystemEventInput defaults to global focus when focusId is omitted', async () => {
  const runtime = await createRuntime()

  await publishManagerSystemEventInput({
    runtime,
    summary: 'The system is currently idle.',
    event: 'idle',
    visibility: 'all',
    payload: {
      idle_since: new Date().toISOString(),
      triggered_at: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    logEvent: 'idle_trigger_input',
  })

  expect(runtime.inflightInputs).toHaveLength(1)
  expect(runtime.inflightInputs[0]?.focusId).toBe(GLOBAL_FOCUS_ID)
})
