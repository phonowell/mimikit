import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { enforceFocusCapacity } from '../src/focus/capacity.js'
import { GLOBAL_FOCUS_ID } from '../src/focus/constants.js'
import { buildPaths } from '../src/fs/paths.js'
import { appendHistory } from '../src/history/store.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-focus-capacity-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config: RuntimeState['config'] = {
    workDir,
    manager: {
      model: 'gpt-test',
      modelReasoningEffort: 'minimal',
      provider: {},
      maxCorrectionRounds: 1,
      promptSections: {
        actionFeedbackMaxBytes: 2048,
        batchResultsMaxBytes: 4096,
        compressedContextMaxBytes: 4096,
        environmentMaxBytes: 2048,
        fileLookupMaxBytes: 4096,
        focusContextsMaxBytes: 4096,
        focusListMaxBytes: 2048,
        historyLookupMaxBytes: 4096,
        inputsMaxBytes: 2048,
        memoryMaxBytes: 2048,
        plansMaxBytes: 4096,
        queryLookupMaxBytes: 4096,
        recentHistoryMaxBytes: 2048,
        tasksMaxBytes: 4096,
      },
      taskCreate: { debounceMs: 0 },
      idleTrigger: { delayMs: 0 },
      taskWindow: { minCount: 1, maxCount: 5 },
      planWindow: { minCount: 1, maxCount: 5 },
    },
    worker: {
      maxConcurrent: 1,
      retry: { maxAttempts: 1, backoffMs: 1 },
      timeoutMs: 60_000,
      model: 'gpt-test-worker',
      modelReasoningEffort: 'minimal',
    },
    telegram: {
      enabled: false,
      botToken: '',
      chatId: '',
      apiRoot: 'https://api.telegram.org',
    },
  }
  const now = '2026-03-05T00:00:00.000Z'
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
    ],
    focusContexts: [],
    activeFocusIds: [GLOBAL_FOCUS_ID],
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
      size: 0,
      pending: 0,
      sizeBy: () => 0,
      add: async () => undefined,
      pause: () => undefined,
      clear: () => undefined,
      onIdle: async () => undefined,
    } as RuntimeState['workerQueue'],
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

test('enforceFocusCapacity does not count global focus against worker maxConcurrent', async () => {
  const runtime = await createRuntime()
  runtime.focuses.push({
    id: 'focus-a',
    title: 'A',
    status: 'active',
    createdAt: '2026-03-05T00:00:01.000Z',
    updatedAt: '2026-03-05T00:00:01.000Z',
    lastActivityAt: '2026-03-05T00:00:01.000Z',
  })
  runtime.activeFocusIds.push('focus-a')

  await enforceFocusCapacity(runtime)

  const focusA = runtime.focuses.find((item) => item.id === 'focus-a')
  expect(focusA?.status).toBe('active')
  expect(runtime.activeFocusIds).toContain('focus-a')
})

test('enforceFocusCapacity keeps archived focus referenced by history', async () => {
  const runtime = await createRuntime()
  runtime.focuses.push(
    {
      id: 'focus-archived-kept',
      title: 'Kept',
      status: 'archived',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'focus-archived-2',
      title: 'Archive 2',
      status: 'archived',
      createdAt: '2026-03-02T00:00:00.000Z',
      updatedAt: '2026-03-02T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
    },
    {
      id: 'focus-archived-drop',
      title: 'Drop',
      status: 'archived',
      createdAt: '2026-03-03T00:00:00.000Z',
      updatedAt: '2026-03-03T00:00:00.000Z',
      lastActivityAt: '2026-03-03T00:00:00.000Z',
    },
  )
  await appendHistory(runtime.paths.history, {
    id: 'hist-1',
    role: 'user',
    text: 'keep archived focus',
    createdAt: '2026-03-05T00:00:00.000Z',
    focusId: 'focus-archived-kept',
  })

  await enforceFocusCapacity(runtime)

  const ids = new Set(runtime.focuses.map((item) => item.id))
  expect(ids.has('focus-archived-kept')).toBe(true)
  const archivedIds = runtime.focuses
    .filter((item) => item.status === 'archived')
    .map((item) => item.id)
  expect(archivedIds).toHaveLength(2)
  expect(
    ids.has('focus-archived-2') || ids.has('focus-archived-drop'),
  ).toBe(true)
})
