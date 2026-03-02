import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { applyTaskActions } from '../src/manager/action-apply.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../src/types/index.js'

const GLOBAL_FOCUS_ID = 'focus-global'

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-action-apply-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  const queue = new PQueue({ concurrency: config.worker.maxConcurrent })
  queue.pause()
  const now = new Date().toISOString()

  return {
    runtimeId: 'runtime-test',
    config,
    paths: buildPaths(workDir),
    stopped: false,
    managerRunning: false,
    managerSignalController: new AbortController(),
    managerWakePending: false,
    lastManagerActivityAtMs: Date.now(),
    lastWorkerActivityAtMs: Date.now(),
    inflightInputs: [],
    queues: {
      inputsCursor: 0,
      resultsCursor: 0,
    },
    tasks: [],
    taskPlans: [],
    focuses: [
      {
        id: GLOBAL_FOCUS_ID,
        title: 'Global',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      },
    ],
    focusContexts: [],
    activeFocusIds: [GLOBAL_FOCUS_ID],
    managerTurn: 0,
    uiStream: null,
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
  }
}

test('run_task re-enqueues pending task when fingerprint matches exactly', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'run_task',
      attrs: {
        prompt: 'same prompt',
        title: 'old title',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.id).toBe('task-pending')
  expect(runtime.workerQueue.size).toBe(1)
})

test('run_task dedupe does not block task creation when fingerprint differs', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'run_task',
      attrs: {
        prompt: 'same prompt',
        title: 'new title',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[1]?.title).toBe('new title')
  expect(runtime.tasks[1]?.fingerprint).not.toBe(runtime.tasks[0]?.fingerprint)
})

test('create_plan uses worker profile for cron plan', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_plan',
      attrs: {
        prompt: 'Summarize daily build status',
        title: 'scheduled',
        trigger_mode: 'cron',
        cron: '0 0 9 * * *',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.profile).toBe('worker')
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('cron')
})

test('write_profile(target=user) writes utf8 content to state file', async () => {
  const runtime = await createRuntime()
  const content = '- 偏好中文\n- 先给结论'
  await applyTaskActions(runtime, [
    {
      name: 'write_profile',
      attrs: {
        target: 'user',
        content,
      },
    },
  ])

  const saved = await readFile(runtime.paths.userProfile, 'utf8')
  expect(saved).toBe(content)
})

test('write_profile(target=persona) snapshots old version before overwrite', async () => {
  const runtime = await createRuntime()
  await writeFile(runtime.paths.agentPersona, 'old persona', 'utf8')
  await applyTaskActions(runtime, [
    {
      name: 'write_profile',
      attrs: {
        target: 'persona',
        content: 'new persona',
      },
    },
  ])

  const current = await readFile(runtime.paths.agentPersona, 'utf8')
  const versions = await readdir(runtime.paths.agentPersonaVersionsDir)
  const snapshot = await readFile(
    join(runtime.paths.agentPersonaVersionsDir, versions[0] ?? ''),
    'utf8',
  )
  expect(current).toBe('new persona')
  expect(versions.length).toBe(1)
  expect(snapshot).toBe('old persona')
})

test('plan actions can create and archive done plan', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_plan',
      attrs: {
        prompt: 'remember release note',
        title: 'release note',
        trigger_mode: 'on_idle',
        priority: 'high',
      },
    },
  ])
  const createdId = runtime.taskPlans[0]?.id
  expect(createdId).toBeTruthy()
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('on_idle')
  expect(runtime.taskPlans[0]?.status).toBe('active')

  await applyTaskActions(runtime, [
    {
      name: 'update_plan',
      attrs: {
        id: createdId ?? '',
        status: 'done',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.status).toBe('done')
  expect(runtime.taskPlans[0]?.archivedAt).toBeTruthy()
})

test('delete_plan removes done plan', async () => {
  const runtime = await createRuntime()
  const donePlan: TaskPlan = {
    id: 'plan-done',
    prompt: 'done prompt',
    title: 'done',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    priority: 'normal',
    source: 'user_request',
    status: 'done',
    trigger: {
      mode: 'on_idle',
      cooldownMs: 0,
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    archivedAt: '2026-02-13T00:00:00.000Z',
    runCount: 1,
    maxRuns: 1,
    doneReason: 'completed',
  }
  runtime.taskPlans.push(donePlan)

  await applyTaskActions(runtime, [
    {
      name: 'delete_plan',
      attrs: {
        id: 'plan-done',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(0)
})

test('update_plan allows last_task_id patch for done plan', async () => {
  const runtime = await createRuntime()
  runtime.taskPlans.push({
    id: 'plan-done-bind',
    prompt: 'scheduled prompt',
    title: 'scheduled title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    priority: 'normal',
    source: 'user_request',
    status: 'done',
    trigger: {
      mode: 'scheduled_at',
      scheduledAt: '2026-02-13T00:00:00.000Z',
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    archivedAt: '2026-02-13T00:00:00.000Z',
    runCount: 1,
    doneReason: 'completed',
  })

  await applyTaskActions(runtime, [
    {
      name: 'update_plan',
      attrs: {
        id: 'plan-done-bind',
        last_task_id: 'task-after-trigger',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.status).toBe('done')
  expect(runtime.taskPlans[0]?.lastTaskId).toBe('task-after-trigger')
  expect(runtime.taskPlans[0]?.archivedAt).toBe('2026-02-13T00:00:00.000Z')
})

test('restart_runtime requests exit through runtime hook', async () => {
  const runtime = await createRuntime()
  const requests: Array<{ code: number; reason: string }> = []
  runtime.requestExit = (request) => {
    requests.push(request)
  }
  vi.useFakeTimers()
  try {
    await applyTaskActions(runtime, [
      {
        name: 'restart_runtime',
        attrs: {},
      },
    ])
    await vi.runAllTimersAsync()
  } finally {
    vi.useRealTimers()
  }
  expect(runtime.stopped).toBe(true)
  expect(requests).toEqual([{ code: 75, reason: 'manager_restart' }])
})
