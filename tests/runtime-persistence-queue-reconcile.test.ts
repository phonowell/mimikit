import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildPaths } from '../src/fs/paths.js'
import { appendHistory } from '../src/history/store.js'
import { createDefaultMemoryRefreshState } from '../src/memory/refresh/state.js'
import {
  hydrateRuntimeState,
  persistRuntimeState,
} from '../src/orchestrator/core/runtime-persistence.js'
import { saveRuntimeSnapshot } from '../src/storage/runtime-snapshot.js'
import { publishUserInput, publishWorkerResult } from '../src/streams/queues.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

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

test('hydrateRuntimeState restores channel targets from snapshot', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
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
  })

  await hydrateRuntimeState(restored)

  expect(restored.session.channelTargets).toEqual({
    telegramChatId: 'chat-1001',
    feishuChatId: 'oc_chat_1',
  })
})

test('hydrateRuntimeState falls back to channel targets from history', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({ workDir: stateDir })
  await appendHistory(runtime.paths.history, {
    id: 'input-history-1',
    role: 'user',
    text: 'hello',
    createdAt: SNAPSHOT_BASE_TIME,
    focusId: GLOBAL_FOCUS_ID,
    telegramChatId: 'chat-1001',
    feishuChatId: 'oc_chat_1',
  })
  await persistRuntimeState(runtime)

  const restored = await createTestRuntimeState({
    workDir: stateDir,
  })

  await hydrateRuntimeState(restored)

  expect(restored.session.channelTargets).toEqual({
    telegramChatId: 'chat-1001',
    feishuChatId: 'oc_chat_1',
  })
})

test('hydrateRuntimeState rebuilds budget resume choice from paused task state', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: {
      tasks: [
        {
          id: 'task-budget-paused',
          fingerprint: 'fp-task-budget-paused',
          prompt: 'resume me',
          title: 'Budget Paused',
          cwd: '/tmp/task-budget-paused',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          provider: 'codex',
          status: 'paused',
          createdAt: SNAPSHOT_BASE_TIME,
          pausedAt: '2026-02-06T00:10:00.000Z',
          result: {
            taskId: 'task-budget-paused',
            status: 'partial',
            taskStatus: 'paused',
            outcome: 'partial',
            stopReason: 'budget_exhausted',
            ok: false,
            output: 'partial output',
            durationMs: 42,
            completedAt: '2026-02-06T00:10:00.000Z',
          },
        },
      ],
    },
  })

  await persistRuntimeState(runtime)

  const restored = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
  })
  await hydrateRuntimeState(restored)

  expect(restored.ui.pendingUserChoices[0]?.effect).toMatchObject({
    type: 'resume_task',
    taskId: 'task-budget-paused',
  })
})
