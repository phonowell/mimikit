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

test('selectPersistedTasks keeps pending and recovers running', () => {
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
    },
  ]

  const persisted = selectPersistedTasks(tasks)
  expect(persisted).toHaveLength(2)
  expect(persisted[0]?.status).toBe('pending')
  expect(persisted[1]?.id).toBe('b')
  expect(persisted[1]?.status).toBe('pending')
  expect(persisted[1]?.startedAt).toBeUndefined()
})

test('runtime snapshot keeps reporting daily state', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [],
    reporting: {
      lastDailyReportDate: '2026-02-07',
    },
  })
  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.reporting?.lastDailyReportDate).toBe('2026-02-07')
})

test('runtime snapshot rejects legacy evolve field', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-state.json'),
    JSON.stringify({
      tasks: [],
      evolve: {
        lastIdleReviewAt: '2026-02-07T10:00:00.000Z',
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('runtime snapshot accepts thinker worker-result cursor', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [],
    channels: {
      teller: {
        userInputCursor: 3,
        thinkerDecisionCursor: 5,
      },
      thinker: {
        tellerDigestCursor: 6,
        workerResultCursor: 9,
      },
    },
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.channels?.thinker.workerResultCursor).toBe(9)
  expect(loaded.channels?.teller.userInputCursor).toBe(3)
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

test('runtime snapshot rejects legacy flat channel cursor fields', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-state.json'),
    JSON.stringify({
      tasks: [],
      channels: {
        tellerUserInputCursor: 3,
        tellerWorkerResultCursor: 4,
        tellerThinkerDecisionCursor: 5,
        thinkerTellerDigestCursor: 6,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})
