import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { createDefaultMemoryRefreshState } from '../src/memory/refresh/state.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from '../src/orchestrator/core/runtime-persistence.js'
import { saveRuntimeSnapshot } from '../src/storage/runtime-snapshot.js'
import { publishUserInput, publishWorkerResult } from '../src/streams/queues.js'
import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'

const GLOBAL_FOCUS_ID = 'focus-global'
const SNAPSHOT_BASE_TIME = '2026-02-06T00:00:00.000Z'
const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-persistence-'))

test('hydrateRuntimeState reconciles stale queue cursors', async () => {
  const stateDir = await createTmpDir()
  const paths = buildPaths(stateDir)
  await publishUserInput({
    paths,
    payload: {
      id: 'input-1',
      role: 'user',
      text: 'hello',
      createdAt: SNAPSHOT_BASE_TIME,
      focusId: GLOBAL_FOCUS_ID,
    },
  })
  await publishWorkerResult({
    paths,
    payload: {
      taskId: 'task-1',
      status: 'succeeded',
      ok: true,
      output: 'done',
      durationMs: 1,
      completedAt: SNAPSHOT_BASE_TIME,
    },
  })
  await saveRuntimeSnapshot(stateDir, {
    tasks: [],
    taskPlans: [],
    queues: {
      inputsCursor: 9,
      resultsCursor: 7,
    },
    memoryRefresh: {
      lastCompletedTurn: 0,
      lastProcessedInputsCursor: 5,
      lastProcessedResultsCursor: 6,
    },
  })

  const runtime = {
    config: { workDir: stateDir },
    paths,
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [],
    taskPlans: [],
    focuses: [],
    focusContexts: [],
    activeFocusIds: [],
    managerTurn: 0,
    memoryRefresh: createDefaultMemoryRefreshState(),
    managerFocusCompressedContexts: [],
  } as RuntimeState

  await hydrateRuntimeState(runtime)

  expect(runtime.queues).toEqual({ inputsCursor: 0, resultsCursor: 0 })
  expect(runtime.memoryRefresh.lastProcessedInputsCursor).toBe(0)
  expect(runtime.memoryRefresh.lastProcessedResultsCursor).toBe(0)
})

test('persist+hydrate keeps reusable session on recovered pending task', async () => {
  const stateDir = await createTmpDir()
  const paths = buildPaths(stateDir)
  const runtime = {
    config: { workDir: stateDir },
    paths,
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [
      {
        id: 'task-recover-session',
        fingerprint: 'fp-task-recover-session',
        prompt: 'resume pending work',
        title: 'Recover Session',
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        status: 'running',
        createdAt: SNAPSHOT_BASE_TIME,
        startedAt: '2026-02-06T00:01:00.000Z',
        sessionId: 'session-reuse-after-restart',
        sessionState: 'reusable' as const,
        sessionUpdatedAt: '2026-02-06T00:01:10.000Z',
      },
    ],
    taskPlans: [],
    focuses: [],
    focusContexts: [],
    activeFocusIds: [],
    managerTurn: 0,
    memoryRefresh: createDefaultMemoryRefreshState(),
    managerFocusCompressedContexts: [],
  } as RuntimeState

  await persistRuntimeState(runtime)

  const restored = {
    config: { workDir: stateDir },
    paths,
    queues: { inputsCursor: 0, resultsCursor: 0 },
    tasks: [],
    taskPlans: [],
    focuses: [],
    focusContexts: [],
    activeFocusIds: [],
    managerTurn: 0,
    memoryRefresh: createDefaultMemoryRefreshState(),
  } as RuntimeState

  await hydrateRuntimeState(restored)

  expect(restored.tasks).toHaveLength(1)
  expect(restored.tasks[0]?.status).toBe('pending')
  expect(restored.tasks[0]?.startedAt).toBeUndefined()
  expect(restored.tasks[0]?.sessionId).toBe('session-reuse-after-restart')
  expect(restored.tasks[0]?.sessionState).toBe('reusable')
})
