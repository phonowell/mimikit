import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import PQueue from 'p-queue'
import { expect, test } from 'vitest'

import { defaultConfig } from '../src/config.js'
import { buildPaths } from '../src/fs/paths.js'
import { readHistory } from '../src/history/store.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
import {
  buildRunTaskConfirmationId,
  RUN_TASK_CONFIRM_OPTION_ID,
} from '../src/manager/run-task-confirmation.js'
import { parseSystemEventText } from '../src/shared/system-event.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../src/types/index.js'

const GLOBAL_FOCUS_ID = 'focus-global'
const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  scope: 'Single runnable worker task',
  acceptance_1: 'Return concrete output',
}

const createTmpDir = () => mkdtemp(join(tmpdir(), 'mimikit-action-apply-'))

const createRuntime = async (): Promise<RuntimeState> => {
  const workDir = await createTmpDir()
  const config = defaultConfig({ workDir })
  config.codex.enabled = true
  config.opencode.enabled = false
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
    memoryRefresh: {
      lastCompletedTurn: 0,
      lastProcessedInputsCursor: 0,
      lastProcessedResultsCursor: 0,
      running: false,
      pending: false,
    },
    managerFocusCompressedContexts: [],
    runningControllers: new Map(),
    createTaskDebounce: new Map(),
    workerQueue: queue,
    workerSignalController: new AbortController(),
    uiWakeVersion: 0,
    uiWakeEvents: new Map(),
    uiSignalControllers: new Set(),
    pendingUserChoice: null,
  }
}

test('enqueue_task re-enqueues pending task when fingerprint matches exactly', async () => {
  const runtime = await createRuntime()
  runtime.focuses.push({
    id: 'focus-local',
    title: 'Local',
    status: 'active',
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    lastActivityAt: '2026-02-13T00:00:01.000Z',
  })
  runtime.activeFocusIds.push('focus-local')
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    contract: {
      goal: CONTRACT_ATTRS.goal,
      scope: CONTRACT_ATTRS.scope,
      acceptance: [CONTRACT_ATTRS.acceptance_1],
    },
    focusId: 'focus-local',
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'same prompt',
        title: 'old title',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.id).toBe('task-pending')
  expect(runtime.tasks[0]?.focusId).toBe('focus-local')
  expect(runtime.workerQueue.size).toBe(1)
})

test('enqueue_task task_created system event includes worker slot status payload', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.maxConcurrent = 3

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'generate release note',
        title: 'release-note',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  const history = await readHistory(runtime.paths.history)
  const createdEvent = history.find(
    (item) =>
      item.role === 'system' && item.text.includes('name="task_created"'),
  )
  expect(createdEvent).toBeTruthy()
  const parsed = parseSystemEventText(createdEvent?.text ?? '')
  expect(parsed.name).toBe('task_created')
  expect(parsed.payload?.slots).toEqual({
    max_slots: 3,
    occupied_slots: 0,
    available_slots: 3,
  })
})

test('enqueue_task dedupe does not block task creation when fingerprint differs', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'same prompt',
        title: 'new title',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[1]?.title).toBe('new title')
  expect(runtime.tasks[1]?.fingerprint).not.toBe(runtime.tasks[0]?.fingerprint)
})

test('enqueue_task contract change does not reuse pending task', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-contract-old',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'same title',
    contract: {
      goal: 'Old goal',
      scope: 'Old scope',
      acceptance: ['Old acceptance'],
    },
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'same prompt',
        title: 'same title',
        goal: 'New goal',
        scope: 'New scope',
        acceptance_1: 'New acceptance',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[0]?.status).toBe('pending')
  expect(runtime.tasks[0]?.cancel).toBeUndefined()
  expect(runtime.tasks[1]?.status).toBe('pending')
  expect(runtime.tasks[1]?.contract?.goal).toBe('New goal')
})

test('enqueue_task without provider picks enabled provider by lowest billing then highest capability', async () => {
  const runtime = await createRuntime()
  runtime.config.codex.enabled = true
  runtime.config.codex.billing = 'medium'
  runtime.config.codex.capability = 'high'
  runtime.config.opencode.enabled = true
  runtime.config.opencode.billing = 'free'
  runtime.config.opencode.capability = 'low'

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'prefer lowest billing',
        title: 'auto provider',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.provider).toBe('opencode')
})

test('enqueue_task without provider picks higher capability when billing ties', async () => {
  const runtime = await createRuntime()
  runtime.config.codex.enabled = true
  runtime.config.codex.billing = 'free'
  runtime.config.codex.capability = 'high'
  runtime.config.opencode.enabled = true
  runtime.config.opencode.billing = 'free'
  runtime.config.opencode.capability = 'low'

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'prefer strongest capability at same billing',
        title: 'auto provider tie',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.provider).toBe('codex')
})

test('enqueue_task creates confirmation choice instead of dispatching high-cost task', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'x'.repeat(1300),
        title: 'high-cost task',
        goal: 'Deliver all outputs',
        scope: 'Cross-module full implementation',
        acceptance_1: 'A',
        acceptance_2: 'B',
        acceptance_3: 'C',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(0)
  expect(runtime.pendingUserChoice).toBeTruthy()
  expect(runtime.pendingUserChoice?.defaultOptionId).toBe(
    'option-cancel-dispatch',
  )
  expect(
    runtime.pendingUserChoice?.options.some(
      (item) => item.id === RUN_TASK_CONFIRM_OPTION_ID,
    ),
  ).toBe(true)
})

test('enqueue_task dispatches high-cost task after explicit confirmation event', async () => {
  const runtime = await createRuntime()
  const prompt = 'x'.repeat(1300)
  const title = 'high-cost task'
  const goal = 'Deliver all outputs'
  const scope = 'Cross-module full implementation'
  const acceptance = ['A', 'B', 'C']
  const choiceId = buildRunTaskConfirmationId({
    prompt,
    title,
    goal,
    scope,
    acceptance,
  })
  runtime.inflightInputs.push({
    id: 'input-choice-confirmed',
    role: 'system',
    visibility: 'all',
    focusId: GLOBAL_FOCUS_ID,
    createdAt: '2026-03-08T00:00:00.000Z',
    text: `<M:system_event name="user_choice" version="1">{"choice_id":"${choiceId}","selected_option_id":"${RUN_TASK_CONFIRM_OPTION_ID}"}</M:system_event>`,
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt,
        title,
        goal,
        scope,
        acceptance_1: acceptance[0] ?? 'A',
        acceptance_2: acceptance[1] ?? 'B',
        acceptance_3: acceptance[2] ?? 'C',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.title).toBe(title)
})

test('high-cost enqueue_task stops later actions in the same batch', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'x'.repeat(1300),
        title: 'high-cost task',
        goal: 'Deliver all outputs',
        scope: 'Cross-module full implementation',
        acceptance_1: 'A',
        acceptance_2: 'B',
        acceptance_3: 'C',
      },
    },
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'small task',
        title: 'small-task',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.pendingUserChoice).toBeTruthy()
  expect(runtime.tasks).toHaveLength(0)
})

test('mutate_task with op=pause marks pending task as paused', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pause-target',
    fingerprint: 'pause fp',
    prompt: 'pause prompt',
    title: 'pause title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'mutate_task',
      attrs: {
        id: 'task-pause-target',
        op: 'pause',
      },
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('paused')
  expect(runtime.tasks[0]?.pausedAt).toBeTypeOf('string')
})

test('mutate_task with op=resume requeues paused task', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-resume-target',
    fingerprint: 'resume fp',
    prompt: 'resume prompt',
    title: 'resume title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'paused',
    createdAt: '2026-02-13T00:00:00.000Z',
    pausedAt: '2026-02-13T00:10:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'mutate_task',
      attrs: {
        id: 'task-resume-target',
        op: 'resume',
      },
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('pending')
  expect(runtime.tasks[0]?.pausedAt).toBeUndefined()
  expect(runtime.workerQueue.size).toBe(1)
})

test('mutate_task with op=cancel marks paused task as canceled', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-cancel-target',
    fingerprint: 'cancel fp',
    prompt: 'cancel prompt',
    title: 'cancel title',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'paused',
    createdAt: '2026-02-13T00:00:00.000Z',
    pausedAt: '2026-02-13T00:10:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'mutate_task',
      attrs: {
        id: 'task-cancel-target',
        op: 'cancel',
      },
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('canceled')
  expect(runtime.tasks[0]?.completedAt).toBeTypeOf('string')
})

test('ask_user_choice stores pending choice and stops later actions in same batch', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'ask_user_choice',
      attrs: {
        id: 'choice-delivery',
        question: 'Choose output format',
        option_1_id: 'option-report',
        option_1_label: 'Report',
        option_1_reason: 'Need full context',
        option_2_id: 'option-checklist',
        option_2_label: 'Checklist',
        option_2_reason: 'Need quick execution',
        default_option_id: 'option-report',
      },
    },
    {
      name: 'enqueue_task',
      attrs: {
        prompt: 'this should not run before user picks',
        title: 'blocked by pending choice',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.pendingUserChoice?.id).toBe('choice-delivery')
  expect(runtime.pendingUserChoice?.options).toHaveLength(2)
  expect(runtime.pendingUserChoice?.options[0]?.reason).toBe('Need full context')
  expect(runtime.tasks).toHaveLength(0)
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

test('create_plan accepts on_worker_slot_freed trigger mode', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_plan',
      attrs: {
        prompt: 'Consume queue when capacity is available',
        title: 'capacity trigger',
        trigger_mode: 'on_worker_slot_freed',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('on_worker_slot_freed')
  expect(runtime.taskPlans[0]?.profile).toBe('worker')
})

test('assign_focus updates task focus by explicit target_type', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-focus-1',
    fingerprint: 'fp-1',
    prompt: 'do something',
    title: 'focus task',
    focusId: GLOBAL_FOCUS_ID,
    profile: 'worker',
    provider: 'codex',
    status: 'pending',
    createdAt: '2026-02-13T00:00:00.000Z',
  })
  runtime.focuses.push({
    id: 'focus-release',
    title: 'Release',
    status: 'active',
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    lastActivityAt: '2026-02-13T00:00:00.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'assign_focus',
      attrs: {
        target_type: 'task',
        target_id: 'task-focus-1',
        focus_id: 'focus-release',
      },
    },
  ])

  expect(runtime.tasks[0]?.focusId).toBe('focus-release')
})

test('upsert_focus accepts open_item_{n} scalar attrs and writes openItems', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-release',
        title: 'Release',
        summary: 'Track release readiness',
        open_item_1: '确认回滚路径',
        open_item_2: '补齐发布清单',
      },
    },
  ])

  const focus = runtime.focuses.find((item) => item.id === 'focus-release')
  expect(focus?.title).toBe('Release')
  const context = runtime.focusContexts.find((item) => item.focusId === 'focus-release')
  expect(context?.summary).toBe('Track release readiness')
  expect(context?.openItems).toEqual(['确认回滚路径', '补齐发布清单'])
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
      mode: 'on_worker_slot_freed',
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

test('remember_memory writes MEMORY.md immediately and emits system event payload', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'remember_memory',
      attrs: {
        content: 'User insists on always using strict ESM imports.',
      },
    },
  ])

  const memoryMarkdown = await readFile(runtime.paths.memoryFile, 'utf8')
  expect(memoryMarkdown).toContain('## [memory-entry] (id:')
  expect(memoryMarkdown).toContain(
    'User insists on always using strict ESM imports.',
  )

  const history = await readHistory(runtime.paths.history)
  const event = history.find(
    (item) =>
      item.role === 'system' &&
      item.text.includes('name="memory_remembered"'),
  )
  expect(event).toBeTruthy()
  const parsed = parseSystemEventText(event?.text ?? '')
  expect(parsed.name).toBe('memory_remembered')
  expect(parsed.payload?.operation).toBe('created')
  expect(typeof parsed.payload?.entry_id).toBe('string')
})
