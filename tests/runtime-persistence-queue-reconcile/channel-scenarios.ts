import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  hydrateRuntimeState,
  persistRuntimeState,
} from '../../src/kernel/orchestrator/runtime-persistence.js'
import { appendHistory } from '../../src/persistence/history/store.js'
import { createTestRuntimeState } from '../helpers/runtime-state.js'

const GLOBAL_FOCUS_ID = 'focus-global'
const SNAPSHOT_BASE_TIME = '2026-02-06T00:00:00.000Z'
const createTmpDir = () =>
  mkdtemp(join(tmpdir(), 'mimikit-runtime-persistence-'))

test('hydrateRuntimeState restores channel targets from snapshot', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    patch: {
      session: {
        channelTargets: {
          telegramChatId: 'chat-1001',
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
  })
  await persistRuntimeState(runtime)

  const restored = await createTestRuntimeState({
    workDir: stateDir,
  })

  await hydrateRuntimeState(restored)

  expect(restored.session.channelTargets).toEqual({
    telegramChatId: 'chat-1001',
  })
})

test('hydrateRuntimeState does not rebuild a user choice from paused task state', async () => {
  const stateDir = await createTmpDir()
  const runtime = await createTestRuntimeState({
    workDir: stateDir,
    withGlobalFocus: false,
    patch: {
      tasks: [
        {
          id: 'task-user-paused',
          fingerprint: 'fp-task-user-paused',
          prompt: 'resume me',
          title: 'User Paused',
          cwd: '/tmp/task-user-paused',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          provider: 'codex',
          status: 'paused',
          createdAt: SNAPSHOT_BASE_TIME,
          pausedAt: '2026-02-06T00:10:00.000Z',
          archivePath: '/tmp/task-user-paused.md',
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

  expect(restored.ui.pendingUserChoices).toEqual([])
})
