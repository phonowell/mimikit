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
import type { Task, TaskPlan } from '../src/types/index.js'

const GLOBAL_FOCUS_ID = 'focus-global'
const SNAPSHOT_BASE_TIME = '2026-02-06T00:00:00.000Z'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-runtime-snapshot-'))

const createTaskFixture = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  fingerprint: 'task-1',
  prompt: 'check',
  title: 'Check',
  focusId: GLOBAL_FOCUS_ID,
  profile: 'worker',
  status: 'pending',
  createdAt: SNAPSHOT_BASE_TIME,
  ...overrides,
})

const createPlanFixture = (
  overrides: Partial<TaskPlan> = {},
): TaskPlan => ({
  id: 'plan-1',
  prompt: 'summarize',
  title: 'summarize',
  focusId: GLOBAL_FOCUS_ID,
  profile: 'worker',
  priority: 'high',
  source: 'user_request',
  status: 'active',
  trigger: {
    mode: 'on_idle',
    cooldownMs: 0,
  },
  createdAt: SNAPSHOT_BASE_TIME,
  updatedAt: SNAPSHOT_BASE_TIME,
  runCount: 0,
  maxRuns: 1,
  ...overrides,
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
    managerFocusCompressedContexts: [
      {
        focusId: GLOBAL_FOCUS_ID,
        summary: 'Goals\n- keep codex-only',
        updatedAt: SNAPSHOT_BASE_TIME,
      },
    ],
  })

  const loaded = await loadRuntimeSnapshot(stateDir)
  expect(loaded.queues?.resultsCursor).toBe(9)
  expect(loaded.queues?.inputsCursor).toBe(3)
  expect(loaded.managerFocusCompressedContexts?.[0]?.summary).toContain(
    'keep codex-only',
  )
  expect(loaded.tasks[0]?.result?.output).toBe('ok')
  expect(loaded.taskPlans[0]?.id).toBe('plan-1')
})

test('buildTaskViews keeps task statuses', () => {
  const tasks: Task[] = [
    createTaskFixture({ id: 'task-done', status: 'succeeded' }),
    createTaskFixture({ id: 'task-failed', status: 'failed' }),
    createTaskFixture({ id: 'task-running', status: 'running' }),
  ]
  const { tasks: views } = buildTaskViews(tasks)
  const statusById = new Map(views.map((item) => [item.id, item.status]))
  expect(statusById.get('task-done')).toBe('succeeded')
  expect(statusById.get('task-failed')).toBe('failed')
  expect(statusById.get('task-running')).toBe('running')
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

test('runtime snapshot rejects legacy managerCompressedContext field', async () => {
  const stateDir = await createTmpDir()
  await writeFile(
    join(stateDir, 'runtime-snapshot.json'),
    JSON.stringify({
      tasks: [],
      taskPlans: [],
      managerCompressedContext: 'legacy',
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
      taskPlans: [],
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
  expect(JSON.parse(primaryRaw)).toEqual(nextSnapshot)
  expect(JSON.parse(backupRaw)).toEqual(oldSnapshot)
})
