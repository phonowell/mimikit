import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../../src/persistence/storage/runtime-snapshot.js'
import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../../src/persistence/storage/runtime-schema-version.js'
import {
  createPlanFixture,
  createTaskFixture,
  GLOBAL_FOCUS_ID,
} from '../helpers/runtime-snapshot.js'

import { createTmpDir } from './testkit.js'

import type { Task } from '../../src/foundation/types/index.js'

test('selectPersistedTasks recovers running task to pending', () => {
  const tasks: Task[] = [
    {
      id: 'b',
      fingerprint: 'b',
      prompt: 'b',
      title: 'b',
      cwd: '/tmp/runtime-snapshot-b',
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
      provider: 'codex',
      status: 'running',
      createdAt: '2026-02-06T00:00:00.000Z',
      startedAt: '2026-02-06T00:01:00.000Z',
      sessionId: 'session-restore-me',
      sessionState: 'reusable',
      sessionUpdatedAt: '2026-02-06T00:01:10.000Z',
    },
  ]

  const persisted = selectPersistedTasks(tasks)
  expect(persisted).toHaveLength(1)
  expect(persisted[0]?.id).toBe('b')
  expect(persisted[0]?.status).toBe('pending')
  expect(persisted[0]?.startedAt).toBeUndefined()
  expect(persisted[0]?.result).toBeUndefined()
  expect(persisted[0]?.sessionId).toBe('session-restore-me')
  expect(persisted[0]?.sessionState).toBe('reusable')
  expect(persisted[0]?.sessionUpdatedAt).toBe('2026-02-06T00:01:10.000Z')
})

test('runtime snapshot accepts queue cursors', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [
      createTaskFixture({
        status: 'succeeded',
        result: {
          taskId: 'task-1',
          status: 'succeeded',
          ok: true,
          output: 'ok',
          durationMs: 5,
          completedAt: '2026-02-06T00:00:05.000Z',
        },
      }),
    ],
    taskPlans: [createPlanFixture()],
    queues: {
      inputsCursor: 3,
      resultsCursor: 9,
    },
    managerThreadId: 'session-manager-1',
    channelTargets: {
      telegramChatId: 'chat-1001',
      feishuChatId: 'oc_chat_1',
    },
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.schemaVersion).toBe(RUNTIME_SNAPSHOT_SCHEMA_VERSION)
  expect(loaded.queues?.resultsCursor).toBe(9)
  expect(loaded.queues?.inputsCursor).toBe(3)
  expect(loaded.managerThreadId).toBe('session-manager-1')
  expect(loaded.channelTargets).toEqual({
    telegramChatId: 'chat-1001',
    feishuChatId: 'oc_chat_1',
  })
  expect(loaded.tasks[0]?.result?.output).toBe('ok')
  expect(loaded.taskPlans[0]?.id).toBe('plan-1')
})

test('loadRuntimeSnapshot falls back to backup file when primary json is broken', async () => {
  const stateDir = await createTmpDir()
  const primaryPath = join(stateDir, 'runtime-snapshot.json')
  const backupPath = `${primaryPath}.bak`
  await writeFile(primaryPath, '{"broken":', 'utf8')
  await writeFile(
    backupPath,
    JSON.stringify({
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 12,
        resultsCursor: 34,
      },
    }),
    'utf8',
  )

  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const loaded = await loadRuntimeSnapshot(stateDir)
    expect(loaded.queues.inputsCursor).toBe(12)
    expect(loaded.queues.resultsCursor).toBe(34)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  } finally {
    consoleErrorSpy.mockRestore()
  }
})

test('saveRuntimeSnapshot writes previous primary content into .bak', async () => {
  const stateDir = await createTmpDir()
  const primaryPath = join(stateDir, 'runtime-snapshot.json')
  const oldSnapshot = {
    tasks: [],
    taskPlans: [],
    queues: { inputsCursor: 1, resultsCursor: 2 },
  }
  await writeFile(primaryPath, JSON.stringify(oldSnapshot), 'utf8')
  const nextSnapshot = {
    tasks: [],
    taskPlans: [],
    queues: { inputsCursor: 7, resultsCursor: 8 },
  }

  await saveRuntimeSnapshot(stateDir, nextSnapshot)

  const primaryRaw = await readFile(primaryPath, 'utf8')
  const backupRaw = await readFile(`${primaryPath}.bak`, 'utf8')
  expect(JSON.parse(primaryRaw)).toEqual({
    schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    ...nextSnapshot,
  })
  expect(JSON.parse(backupRaw)).toEqual(oldSnapshot)
})
