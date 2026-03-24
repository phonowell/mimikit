import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { createDefaultMemoryRefreshState } from '../../src/policy/memory/refresh/state.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from '../../src/kernel/orchestrator/runtime-persistence.js'
import { buildPaths } from '../../src/persistence/fs/paths.js'
import { publishUserInput, publishWorkerResult } from '../../src/kernel/streams/queues.js'
import { saveRuntimeSnapshot } from '../../src/persistence/storage/runtime-snapshot.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

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
      signalVersion: 5,
      lastProcessedSignalVersion: 3,
    },
  })

  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })

  await hydrateRuntimeState(runtime)

  expect(runtime.queues).toEqual({ inputsCursor: 0, resultsCursor: 0 })
  expect(runtime.manager.memoryRefresh.lastProcessedSignalVersion).toBe(3)
})

test('persist+hydrate keeps reusable session on recovered pending task', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: {
      tasks: [
        {
          id: 'task-recover-session',
          fingerprint: 'fp-task-recover-session',
          prompt: 'resume pending work',
          title: 'Recover Session',
          cwd: '/tmp/recover-session',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          provider: 'codex',
          status: 'running',
          createdAt: SNAPSHOT_BASE_TIME,
          startedAt: '2026-02-06T00:01:00.000Z',
          sessionId: 'session-reuse-after-restart',
          sessionState: 'reusable',
          sessionUpdatedAt: '2026-02-06T00:01:10.000Z',
        },
      ],
      manager: {
        turn: 0,
        threadId: 'session-manager-persisted',
        memoryRefresh: createDefaultMemoryRefreshState(),
      },
    },
  })

  await persistRuntimeState(runtime)

  const restored = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })

  await hydrateRuntimeState(restored)

  expect(restored.tasks).toHaveLength(1)
  expect(restored.tasks[0]?.status).toBe('pending')
  expect(restored.tasks[0]?.startedAt).toBeUndefined()
  expect(restored.tasks[0]?.sessionId).toBe('session-reuse-after-restart')
  expect(restored.tasks[0]?.sessionState).toBe('reusable')
  expect(restored.manager.threadId).toBe('session-manager-persisted')
})
