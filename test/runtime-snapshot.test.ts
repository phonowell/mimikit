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

const GLOBAL_FOCUS_ID = 'focus-global'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-snapshot-'))

test('selectPersistedTasks keeps non-running task statuses unchanged', () => {
  const tasks: Task[] = [
    {
      id: 'a',
      fingerprint: 'a',
      prompt: 'a',
      title: 'a',
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
      status: 'pending',
      createdAt: '2026-02-06T00:00:00.000Z',
    },
    {
      id: 'c',
      fingerprint: 'c',
      prompt: 'c',
      title: 'c',
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
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
  expect(persisted).toHaveLength(2)
  expect(persisted[0]?.status).toBe('pending')
  expect(persisted[1]?.id).toBe('c')
  expect(persisted[1]?.status).toBe('succeeded')
  expect(persisted[1]?.result?.output).toBe('done')
})

test('selectPersistedTasks recovers running task to pending', () => {
  const tasks: Task[] = [
    {
      id: 'b',
      fingerprint: 'b',
      prompt: 'b',
      title: 'b',
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
      status: 'running',
      createdAt: '2026-02-06T00:00:00.000Z',
      startedAt: '2026-02-06T00:01:00.000Z',
    },
  ]

  const persisted = selectPersistedTasks(tasks)
  expect(persisted).toHaveLength(1)
  expect(persisted[0]?.id).toBe('b')
  expect(persisted[0]?.status).toBe('pending')
  expect(persisted[0]?.startedAt).toBeUndefined()
  expect(persisted[0]?.result).toBeUndefined()
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
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
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
    idleIntents: [
      {
        id: 'intent-1',
        prompt: 'summarize',
        title: 'summarize',
        focusId: GLOBAL_FOCUS_ID,
        priority: 'high',
        status: 'pending',
        source: 'user_request',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
        attempts: 0,
        maxAttempts: 2,
        triggerPolicy: {
          mode: 'one_shot',
          cooldownMs: 0,
        },
        triggerState: {
          totalTriggered: 0,
        },
      },
    ],
    idleIntentArchive: [
      {
        id: 'intent-2',
        prompt: 'done',
        title: 'done',
        focusId: GLOBAL_FOCUS_ID,
        priority: 'normal',
        status: 'done',
        source: 'agent_auto',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:10:00.000Z',
        archivedAt: '2026-02-06T00:10:00.000Z',
        attempts: 1,
        maxAttempts: 2,
        triggerPolicy: {
          mode: 'one_shot',
          cooldownMs: 0,
        },
        triggerState: {
          totalTriggered: 1,
          lastCompletedAt: '2026-02-06T00:10:00.000Z',
        },
      },
    ],
    queues: {
      inputsCursor: 3,
      resultsCursor: 9,
    },
    managerCompressedContext: 'Goals\n- keep codex-only',
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.queues?.resultsCursor).toBe(9)
  expect(loaded.queues?.inputsCursor).toBe(3)
  expect(loaded.managerCompressedContext).toContain('keep codex-only')
  expect(loaded.tasks[0]?.result?.output).toBe('ok')
  expect(loaded.idleIntents?.[0]?.id).toBe('intent-1')
  expect(loaded.idleIntentArchive?.[0]?.status).toBe('done')
})

test('buildTaskViews maps cron job statuses from disabled reasons', () => {
  const cronJobs: CronJob[] = [
    {
      id: 'cron-completed',
      scheduledAt: '2026-02-13T17:22:20+08:00',
      prompt: 'remind',
      title: 'remind',
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
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
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
      enabled: false,
      disabledReason: 'canceled',
      createdAt: '2026-02-13T09:22:04.602Z',
    },
    {
      id: 'cron-legacy-completed',
      scheduledAt: '2026-02-13T17:22:20+08:00',
      prompt: 'remind',
      title: 'remind',
      focusId: GLOBAL_FOCUS_ID,
      profile: 'worker',
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

test('runtime snapshot rejects legacy next fields', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      tasks: [
        {
          id: 'task-legacy-next',
          fingerprint: 'task-legacy-next',
          prompt: 'legacy',
          title: 'legacy',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
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
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
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
