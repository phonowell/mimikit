import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test, vi } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { applyTaskActions } from '../src/manager/action-apply.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { TaskTemplate } from '../src/types/index.js'

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
    taskTemplates: [],
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

test('run_task rejects forbidden .mimikit state paths', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'run_task',
      attrs: {
        prompt: 'Read .mimikit/history/2026-02-15.jsonl and summarize',
        title: 'forbidden',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(0)
})

test('run_task allows .mimikit/generated path', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'run_task',
      attrs: {
        prompt: 'Write report to .mimikit/generated',
        title: 'allowed',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.title).toBe('allowed')
})

test('create_template uses worker profile for cron template', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_template',
      attrs: {
        prompt: 'Summarize daily build status',
        title: 'scheduled',
        trigger_mode: 'cron',
        cron: '0 0 9 * * *',
      },
    },
  ])

  expect(runtime.taskTemplates).toHaveLength(1)
  expect(runtime.taskTemplates[0]?.profile).toBe('worker')
  expect(runtime.taskTemplates[0]?.trigger.mode).toBe('cron')
})

test('write_user_profile writes utf8 content to state file', async () => {
  const runtime = await createRuntime()
  const content = '- 偏好中文\n- 先给结论'
  await applyTaskActions(runtime, [
    {
      name: 'write_user_profile',
      attrs: {
        content,
      },
    },
  ])

  const saved = await readFile(runtime.paths.userProfile, 'utf8')
  expect(saved).toBe(content)
})

test('write_persona snapshots old version before overwrite', async () => {
  const runtime = await createRuntime()
  await writeFile(runtime.paths.agentPersona, 'old persona', 'utf8')
  await applyTaskActions(runtime, [
    {
      name: 'write_persona',
      attrs: {
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

test('template actions can create and archive done template', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_template',
      attrs: {
        prompt: 'remember release note',
        title: 'release note',
        trigger_mode: 'on_idle',
        priority: 'high',
      },
    },
  ])
  const createdId = runtime.taskTemplates[0]?.id
  expect(createdId).toBeTruthy()
  expect(runtime.taskTemplates[0]?.trigger.mode).toBe('on_idle')
  expect(runtime.taskTemplates[0]?.status).toBe('active')

  await applyTaskActions(runtime, [
    {
      name: 'update_template',
      attrs: {
        id: createdId ?? '',
        status: 'done',
      },
    },
  ])

  expect(runtime.taskTemplates).toHaveLength(1)
  expect(runtime.taskTemplates[0]?.status).toBe('done')
  expect(runtime.taskTemplates[0]?.archivedAt).toBeTruthy()
})

test('delete_template removes done template', async () => {
  const runtime = await createRuntime()
  const doneTemplate: TaskTemplate = {
    id: 'tpl-done',
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
  runtime.taskTemplates.push(doneTemplate)

  await applyTaskActions(runtime, [
    {
      name: 'delete_template',
      attrs: {
        id: 'tpl-done',
      },
    },
  ])

  expect(runtime.taskTemplates).toHaveLength(0)
})

test('update_template allows last_task_id patch for done template', async () => {
  const runtime = await createRuntime()
  runtime.taskTemplates.push({
    id: 'tpl-done-bind',
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
      name: 'update_template',
      attrs: {
        id: 'tpl-done-bind',
        last_task_id: 'task-after-trigger',
      },
    },
  ])

  expect(runtime.taskTemplates).toHaveLength(1)
  expect(runtime.taskTemplates[0]?.status).toBe('done')
  expect(runtime.taskTemplates[0]?.lastTaskId).toBe('task-after-trigger')
  expect(runtime.taskTemplates[0]?.archivedAt).toBe('2026-02-13T00:00:00.000Z')
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
