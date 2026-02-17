import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { buildTaskViews } from '../src/orchestrator/read-model/task-view.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../src/storage/runtime-snapshot.js'
import type { CronJob, Task } from '../src/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-snapshot-'))

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

  const cronJobs: CronJob[] = [
    {
      id: 'cron-completed',
      scheduledAt: '2026-02-13T17:22:20+08:00',
      prompt: 'remind',
      title: 'remind',
      profile: 'manager',
      enabled: false,
      disabledReason: 'completed',
      createdAt: '2026-02-13T09:22:04.602Z',
      lastTriggeredAt: '2026-02-13T09:22:20.735Z',
    },
    {
      id: 'cron-canceled',
      scheduledAt: '2026-02-13T17:22:20+08:00',
      prompt: 'remind',
      title: 'remind',
      profile: 'manager',
      enabled: false,
      disabledReason: 'canceled',
      createdAt: '2026-02-13T09:22:04.602Z',
    },
    {
      id: 'cron-legacy-completed',
      scheduledAt: '2026-02-13T17:22:20+08:00',
      prompt: 'remind',
      title: 'remind',
      profile: 'manager',
      enabled: false,
      createdAt: '2026-02-13T09:22:04.602Z',
      lastTriggeredAt: '2026-02-13T09:22:20.735Z',
    },
  ]
  const { tasks, counts } = buildTaskViews([], cronJobs)
  const statusById = new Map(tasks.map((item) => [item.id, item.status]))
  expect(statusById.get('cron-completed')).toBe('succeeded')
  expect(statusById.get('cron-canceled')).toBe('canceled')
  expect(statusById.get('cron-legacy-completed')).toBe('succeeded')
  expect(counts.succeeded).toBe(2)
  expect(counts.canceled).toBe(1)
})

test('runtime snapshot rejects legacy grouped channel shape and next fields', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
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

  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      tasks: [
        {
          id: 'task-legacy-next',
          fingerprint: 'task-legacy-next',
          prompt: 'legacy',
          title: 'legacy',
          profile: 'standard',
          status: 'pending',
          createdAt: '2026-02-06T00:00:00.000Z',
          next: [{ prompt: 'next task', condition: 'succeeded' }],
        },
      ],
      cronJobs: [
        {
          id: 'cron-legacy-next',
          cron: '0 0 9 * * *',
          prompt: 'legacy cron',
          title: 'legacy cron',
          profile: 'standard',
          enabled: true,
          createdAt: '2026-02-06T00:00:00.000Z',
          next: { prompt: 'next cron task', condition: 'succeeded' },
        },
      ],
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('loadRuntimeSnapshot falls back to backup file when primary json is broken', async () => {
  const stateDir = await createTmpDir()
  const primaryPath = join(stateDir, 'runtime-snapshot.json')
  const backupPath = `${primaryPath}.bak`
  await writeFile(primaryPath, '{"broken":', 'utf8')
  await writeFile(
    backupPath,
    JSON.stringify({
      tasks: [],
      cronJobs: [],
      queues: {
        inputsCursor: 12,
        resultsCursor: 34,
      },
    }),
    'utf8',
  )

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.queues.inputsCursor).toBe(12)
  expect(loaded.queues.resultsCursor).toBe(34)
})

test('saveRuntimeSnapshot writes previous primary content into .bak', async () => {
  const stateDir = await createTmpDir()
  const primaryPath = join(stateDir, 'runtime-snapshot.json')
  const oldSnapshot = {
    tasks: [],
    cronJobs: [],
    queues: { inputsCursor: 1, resultsCursor: 2 },
  }
  await writeFile(primaryPath, JSON.stringify(oldSnapshot), 'utf8')
  const nextSnapshot = {
    tasks: [],
    cronJobs: [],
    queues: { inputsCursor: 7, resultsCursor: 8 },
  }

  await saveRuntimeSnapshot(stateDir, nextSnapshot)

  const primaryRaw = await readFile(primaryPath, 'utf8')
  const backupRaw = await readFile(`${primaryPath}.bak`, 'utf8')
  expect(JSON.parse(primaryRaw)).toEqual(nextSnapshot)
  expect(JSON.parse(backupRaw)).toEqual(oldSnapshot)
})
