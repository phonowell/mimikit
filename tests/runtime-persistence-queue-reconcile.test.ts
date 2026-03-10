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
import { createTestRuntimeState } from './helpers/runtime-state.js'
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

  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })

  await hydrateRuntimeState(runtime)

  expect(runtime.queues).toEqual({ inputsCursor: 0, resultsCursor: 0 })
  expect(runtime.manager.memoryRefresh.lastProcessedInputsCursor).toBe(0)
  expect(runtime.manager.memoryRefresh.lastProcessedResultsCursor).toBe(0)
})

test('persist+hydrate keeps reusable session on recovered pending task', async () => {
  const stateDir = await createTmpDir()
  const paths = buildPaths(stateDir)
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

test('persist+hydrate keeps channel targets for cross-channel broadcast', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: {
      session: {
        channelTargets: {
          telegramChatId: 'chat-1001',
          feishuChatId: 'oc_chat_1',
        },
      },
    },
  })

  await persistRuntimeState(runtime)

  const restored = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })

  await hydrateRuntimeState(restored)

  expect(restored.session.channelTargets).toEqual({
    telegramChatId: 'chat-1001',
    feishuChatId: 'oc_chat_1',
  })
})

test('persist+hydrate prunes compressed focus contexts that no longer belong to a live focus', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: {
      focuses: [
        {
          id: 'focus-kept',
          title: 'Kept',
          status: 'active',
          createdAt: SNAPSHOT_BASE_TIME,
          updatedAt: SNAPSHOT_BASE_TIME,
          lastActivityAt: SNAPSHOT_BASE_TIME,
        },
      ],
      manager: {
        focusCompressedContexts: [
          {
            focusId: GLOBAL_FOCUS_ID,
            summary: 'legacy global summary',
            updatedAt: SNAPSHOT_BASE_TIME,
          },
          {
            focusId: 'focus-missing',
            summary: 'orphan summary',
            updatedAt: SNAPSHOT_BASE_TIME,
          },
          {
            focusId: 'focus-kept',
            summary: 'kept summary',
            updatedAt: SNAPSHOT_BASE_TIME,
          },
        ],
      },
    },
  })

  await persistRuntimeState(runtime)

  const restored = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })
  await hydrateRuntimeState(restored)

  expect(restored.manager.focusCompressedContexts).toEqual([
    {
      focusId: 'focus-kept',
      summary: 'kept summary',
      updatedAt: SNAPSHOT_BASE_TIME,
    },
  ])
})
