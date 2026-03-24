import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, vi } from 'vitest'

import { buildTaskViews } from '../src/surface/read-model/task-view.js'
import {
  loadRuntimeSnapshot,
  saveRuntimeSnapshot,
  selectPersistedTasks,
} from '../src/persistence/storage/runtime-snapshot.js'
import { RUNTIME_SNAPSHOT_SCHEMA_VERSION } from '../src/persistence/storage/runtime-schema-version.js'
import {
  createPlanFixture,
  createTaskFixture,
  GLOBAL_FOCUS_ID,
  SNAPSHOT_BASE_TIME,
} from './helpers/runtime-snapshot.js'
import type { Task, TaskPlan } from '../src/foundation/types/index.js'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-snapshot-'))

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

test('runtime snapshot rejects snapshot without schemaVersion', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 1,
        resultsCursor: 2,
      },
    }),
    'utf8',
  )
  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    /schema version not supported/i,
  )
})

test('runtime snapshot rejects older schema version', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: 'runtime-snapshot.v2',
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 1,
        resultsCursor: 2,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    /schema version not supported/i,
  )
})

test('runtime snapshot rejects legacy single pendingUserChoice field', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      tasks: [],
      taskPlans: [],
      pendingUserChoice: {
        id: 'choice-legacy',
        question: 'continue?',
        options: [
          { id: 'option-yes', label: 'Yes', reason: 'continue' },
          { id: 'option-no', label: 'No', reason: 'stop' },
        ],
        defaultOptionId: 'option-no',
        createdAt: SNAPSHOT_BASE_TIME,
        focusId: GLOBAL_FOCUS_ID,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('runtime snapshot rejects unsupported future schema version', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: 'runtime-snapshot.v99',
      tasks: [],
      taskPlans: [],
      queues: {
        inputsCursor: 1,
        resultsCursor: 2,
      },
    }),
    'utf8',
  )
  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow(
    /schema version not supported/i,
  )
})

test('runtime snapshot accepts on_worker_slot_freed trigger', async () => {
  const stateDir = await createTmpDir()
  await saveRuntimeSnapshot(stateDir, {
    tasks: [],
    taskPlans: [
      createPlanFixture({
        id: 'plan-capacity',
        trigger: {
          mode: 'on_worker_slot_freed',
        },
      }),
    ],
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.taskPlans).toHaveLength(1)
  expect(loaded.taskPlans[0]?.trigger.mode).toBe('on_worker_slot_freed')
})

test('loadRuntimeSnapshot rejects legacy worker-slot trigger mode', async () => {
  const stateDir = await createTmpDir()
  const snapshotPath = join(stateDir, 'runtime-snapshot.json')
  await writeFile(
    snapshotPath,
    JSON.stringify({
      tasks: [],
      taskPlans: [
        {
          id: 'plan-legacy-capacity',
          prompt: 'legacy',
          title: 'legacy',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          priority: 'normal',
          source: 'user_request',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_available',
          },
          createdAt: SNAPSHOT_BASE_TIME,
          updatedAt: SNAPSHOT_BASE_TIME,
          runtime: { runCount: 0 },
        },
      ],
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('buildTaskViews keeps task statuses', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-done',
      status: 'succeeded',
      completedAt: '2026-03-01T00:06:00.000Z',
    }),
    createTaskFixture({ id: 'task-failed', status: 'failed' }),
    createTaskFixture({ id: 'task-paused', status: 'paused' }),
    createTaskFixture({ id: 'task-running', status: 'running' }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  const statusById = new Map(views.map((item) => [item.id, item.status]))
  expect(statusById.get('task-done')).toBe('succeeded')
  expect(statusById.get('task-failed')).toBe('failed')
  expect(statusById.get('task-paused')).toBe('paused')
  expect(statusById.get('task-running')).toBe('running')
})

test('buildTaskViews includes task provider in view payload', () => {
  const tasks: Task[] = [createTaskFixture({ id: 'task-codex', provider: 'codex' })]
  const { tasks: views } = buildTaskViews(tasks)
  const providerById = new Map(views.map((item) => [item.id, item.provider]))
  expect(providerById.get('task-codex')).toBe('codex')
})

test('buildTaskViews marks pending reason as waiting_capacity when worker slots are full', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-running',
      status: 'running',
      cwd: '/tmp/runtime-snapshot-running',
    }),
    createTaskFixture({
      id: 'task-pending',
      status: 'pending',
      cwd: '/tmp/runtime-snapshot-pending',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 1,
    runningTaskCount: 1,
  })
  const pending = views.find((item) => item.id === 'task-pending')
  expect(pending?.pending_reason).toBe('waiting_capacity')
})

test('buildTaskViews omits pending reason when worker slots are available', () => {
  const tasks: Task[] = [createTaskFixture({ id: 'task-pending' })]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 2,
    runningTaskCount: 1,
  })
  expect(views[0]?.pending_reason).toBeUndefined()
})

test('buildTaskViews includes running live output snippet', () => {
  const tasks: Task[] = [
    createTaskFixture({ id: 'task-running', status: 'running' }),
    createTaskFixture({ id: 'task-pending', status: 'pending' }),
  ]
  const { tasks: views } = buildTaskViews(tasks, 200, {
    maxConcurrentWorkers: 2,
    runningTaskCount: 1,
    liveOutputByTaskId: new Map([['task-running', 'partial output']]),
  })
  const running = views.find((item) => item.id === 'task-running')
  const pending = views.find((item) => item.id === 'task-pending')
  expect(running?.liveOutput).toBe('partial output')
  expect(pending?.liveOutput).toBeUndefined()
})

test('buildTaskViews exposes recoverable budget pause state', () => {
  const task = createTaskFixture({
    id: 'task-budget-pause',
    status: 'paused',
    pausedAt: '2026-03-01T00:05:50.000Z',
    result: {
      taskId: 'task-budget-pause',
      status: 'partial',
      taskStatus: 'paused',
      outcome: 'partial',
      stopReason: 'budget_exhausted',
      ok: false,
      output: 'partial',
      durationMs: 50,
      completedAt: '2026-03-01T00:05:50.000Z',
    },
  })

  const { tasks: views } = buildTaskViews([task])
  expect(views[0]).toMatchObject({
    id: 'task-budget-pause',
    status: 'paused',
    stopReason: 'budget_exhausted',
    recoverable: true,
  })
})

test('buildTaskViews sorts by status, change time, created time, then id', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-running-old',
      status: 'running',
      createdAt: '2026-03-01T00:01:00.000Z',
      startedAt: '2026-03-01T00:02:00.000Z',
    }),
    createTaskFixture({
      id: 'task-running-new',
      status: 'running',
      createdAt: '2026-03-01T00:03:00.000Z',
      startedAt: '2026-03-01T00:04:00.000Z',
    }),
    createTaskFixture({
      id: 'task-paused',
      status: 'paused',
      createdAt: '2026-03-01T00:02:20.000Z',
      pausedAt: '2026-03-01T00:05:50.000Z',
    }),
    createTaskFixture({
      id: 'task-pending-new',
      status: 'pending',
      createdAt: '2026-03-01T00:05:00.000Z',
    }),
    createTaskFixture({
      id: 'task-pending-old',
      status: 'pending',
      createdAt: '2026-03-01T00:01:00.000Z',
    }),
    createTaskFixture({
      id: 'task-failed',
      status: 'failed',
      createdAt: '2026-03-01T00:02:00.000Z',
      completedAt: '2026-03-01T00:06:00.000Z',
    }),
    createTaskFixture({
      id: 'task-succeeded',
      status: 'succeeded',
      createdAt: '2026-03-01T00:02:30.000Z',
      completedAt: '2026-03-01T00:07:00.000Z',
    }),
    createTaskFixture({
      id: 'task-canceled',
      status: 'canceled',
      createdAt: '2026-03-01T00:02:40.000Z',
      completedAt: '2026-03-01T00:08:00.000Z',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  expect(views.map((item) => item.id)).toEqual([
    'task-running-new',
    'task-running-old',
    'task-paused',
    'task-pending-new',
    'task-pending-old',
    'task-failed',
    'task-succeeded',
    'task-canceled',
  ])
})

test('buildTaskViews uses id as stable tie-breaker for same status and time', () => {
  const tasks: Task[] = [
    createTaskFixture({
      id: 'task-pending-b',
      status: 'pending',
      createdAt: '2026-03-01T00:05:00.000Z',
    }),
    createTaskFixture({
      id: 'task-pending-a',
      status: 'pending',
      createdAt: '2026-03-01T00:05:00.000Z',
    }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  expect(views.map((item) => item.id)).toEqual([
    'task-pending-a',
    'task-pending-b',
  ])
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
          cwd: '/tmp/runtime-snapshot-legacy-next',
          focusId: GLOBAL_FOCUS_ID,
          profile: 'worker',
          provider: 'codex',
          status: 'pending',
          createdAt: '2026-02-06T00:00:00.000Z',
          next: [{ prompt: 'next task', condition: 'succeeded' }],
        },
      ],
      taskPlans: [],
      queues: {
        inputsCursor: 0,
        resultsCursor: 0,
      },
    }),
    'utf8',
  )

  await expect(loadRuntimeSnapshot(stateDir)).rejects.toThrow()
})

test('runtime snapshot rejects legacy extra fields during load', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      schemaVersion: 'runtime-snapshot.v6',
      tasks: [],
      taskPlans: [],
      pendingUserChoice: {
        id: 'choice-legacy',
        question: 'legacy',
        options: [
          { id: 'option-a', label: 'A', reason: 'a' },
          { id: 'option-b', label: 'B', reason: 'b' },
        ],
        defaultOptionId: 'option-b',
        createdAt: SNAPSHOT_BASE_TIME,
        focusId: GLOBAL_FOCUS_ID,
      },
      managerCompressedContext: 'legacy-summary',
      managerPacketSummary: 'legacy-packet-summary',
      managerLastUsage: { input: 1, output: 2, total: 3 },
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
