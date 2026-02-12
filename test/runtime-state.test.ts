import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../src/storage/runtime-state.js'
import type { Task } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-state-'))

test('selectPersistedTasks keeps all statuses and recovers running', () => {
  const tasks: Task[] = [
    {
      id: 'a',
      fingerprint: 'a',
      prompt: 'a',
      title: 'a',
      profile: 'standard',
      status: 'pending',
      createdAt: '2026-02-06T00:00:00.000Z',
    },
    {
      id: 'b',
      fingerprint: 'b',
      prompt: 'b',
      title: 'b',
      profile: 'standard',
      status: 'running',
      createdAt: '2026-02-06T00:00:00.000Z',
      startedAt: '2026-02-06T00:01:00.000Z',
    },
    {
      id: 'c',
      fingerprint: 'c',
      prompt: 'c',
      title: 'c',
      profile: 'standard',
      status: 'succeeded',
      createdAt: '2026-02-06T00:00:00.000Z',
      result: {
        taskId: 'c',
        status: 'succeeded',
        ok: true,
        output: 'done',
        durationMs: 12,
        completedAt: '2026-02-06T00:01:00.000Z',
      },
    },
  ]

  const persisted = selectPersistedTasks(tasks)
  expect(persisted).toHaveLength(3)
  expect(persisted[0]?.status).toBe('pending')
  expect(persisted[1]?.id).toBe('b')
  expect(persisted[1]?.status).toBe('pending')
  expect(persisted[1]?.startedAt).toBeUndefined()
  expect(persisted[1]?.result).toBeUndefined()
  expect(persisted[2]?.id).toBe('c')
  expect(persisted[2]?.status).toBe('succeeded')
  expect(persisted[2]?.result?.output).toBe('done')
})

test('runtime snapshot accepts queue cursors', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [
      {
        id: 'task-1',
        fingerprint: 'task-1',
        prompt: 'check',
        title: 'Check',
        profile: 'standard',
        status: 'succeeded',
        createdAt: '2026-02-06T00:00:00.000Z',
        result: {
          taskId: 'task-1',
          status: 'succeeded',
          ok: true,
          output: 'ok',
          durationMs: 5,
          completedAt: '2026-02-06T00:00:05.000Z',
        },
      },
    ],
    queues: {
      inputsCursor: 3,
      resultsCursor: 9,
    },
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.queues?.resultsCursor).toBe(9)
  expect(loaded.queues?.inputsCursor).toBe(3)
  expect(loaded.tasks[0]?.result?.output).toBe('ok')
})

test('runtime snapshot rejects legacy grouped channel shape', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-state.json'),
    JSON.stringify({
      tasks: [],
      channels: {
        teller: {
          userInputCursor: 3,
          workerResultCursor: 4,
          thinkerDecisionCursor: 5,
        },
        thinker: {
          tellerDigestCursor: 6,
        },
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})
