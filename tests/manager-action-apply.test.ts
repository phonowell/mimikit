import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../src/focus/constants.js'
import { readHistory } from '../src/history/store.js'
import { applyTaskActions } from '../src/manager/action-apply.js'
import {
  buildRunTaskConfirmationId,
  RUN_TASK_CONFIRM_OPTION_ID,
} from '../src/manager/run-task-confirmation.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

import type { RuntimeState } from '../src/orchestrator/core/runtime-state.js'
import type { TaskPlan } from '../src/types/index.js'

const CONTRACT_ATTRS = {
  goal: 'Deliver requested outcome',
  in_scope: 'Single runnable worker task',
  done_when_1: 'Return concrete output',
}
const TASK_CWD = '/tmp/manager-action-apply-task'

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState({ pausedQueue: true })
  runtime.config.codex.enabled = true
  return runtime
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
  runtime.tasks.push({
    id: 'task-pending',
    fingerprint: 'same prompt',
    prompt: 'same prompt',
    title: 'old title',
    cwd: TASK_CWD,
    contract: {
      goal: CONTRACT_ATTRS.goal,
      scope: CONTRACT_ATTRS.in_scope,
      acceptance: [CONTRACT_ATTRS.done_when_1],
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
        worker_prompt: 'same prompt',
        title: 'old title',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.id).toBe('task-pending')
  expect(runtime.tasks[0]?.focusId).toBe('focus-local')
  expect(runtime.worker.queue.size).toBe(1)
})

test('enqueue_task task_created system event includes worker slot status payload', async () => {
  const runtime = await createRuntime()
  runtime.config.worker.maxConcurrent = 3

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'generate release note',
        title: 'release-note',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  const history = await readHistory(runtime.paths.history)
  const createdEvent = history.find(
    (item) => item.role === 'system' && item.systemEventName === 'task_created',
  )
  expect(createdEvent).toBeTruthy()
  expect(createdEvent?.systemEventPayload?.slots).toEqual({
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
    cwd: TASK_CWD,
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
        worker_prompt: 'same prompt',
        title: 'new title',
        cwd: TASK_CWD,
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
    cwd: TASK_CWD,
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
        worker_prompt: 'same prompt',
        title: 'same title',
        cwd: TASK_CWD,
        goal: 'New goal',
        in_scope: 'New scope',
        done_when_1: 'New acceptance',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[0]?.status).toBe('pending')
  expect(runtime.tasks[0]?.cancel).toBeUndefined()
  expect(runtime.tasks[1]?.status).toBe('pending')
  expect(runtime.tasks[1]?.contract?.goal).toBe('New goal')
})

test('enqueue_task always dispatches on codex', async () => {
  const runtime = await createRuntime()
  runtime.config.codex.enabled = true

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'default provider',
        title: 'auto provider',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(1)
  expect(runtime.tasks[0]?.provider).toBe('codex')
})

test('enqueue_task keeps codex even when the focus already has recent tasks', async () => {
  const runtime = await createRuntime()
  runtime.config.codex.enabled = true
  runtime.focuses.push({
    id: 'focus-affinity',
    title: 'Affinity',
    status: 'active',
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    lastActivityAt: '2026-03-08T00:00:02.000Z',
  })
  runtime.tasks.push({
    id: 'task-affinity-1',
    fingerprint: 'task-affinity-1',
    prompt: 'existing focus task',
    title: 'Existing focus task',
    cwd: TASK_CWD,
    focusId: 'focus-affinity',
    profile: 'worker',
    provider: 'codex',
    status: 'succeeded',
    createdAt: '2026-03-08T00:00:00.000Z',
    completedAt: '2026-03-08T00:00:03.000Z',
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'follow same focus runtime',
        title: 'affinitized provider',
        cwd: TASK_CWD,
        focus_id: 'focus-affinity',
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(2)
  expect(runtime.tasks[1]?.provider).toBe('codex')
})

test('enqueue_task creates confirmation choice instead of dispatching high-cost task', async () => {
  const runtime = await createRuntime()

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'x'.repeat(1300),
        title: 'high-cost task',
        cwd: TASK_CWD,
        goal: 'Deliver all outputs',
        in_scope: 'Cross-module full implementation',
        done_when_1: 'A',
        done_when_2: 'B',
        done_when_3: 'C',
      },
    },
  ])

  expect(runtime.tasks).toHaveLength(0)
  expect(runtime.ui.pendingUserChoices).toHaveLength(1)
  expect(runtime.ui.pendingUserChoices[0]?.defaultOptionId).toBe(
    'option-cancel-dispatch',
  )
  expect(
    runtime.ui.pendingUserChoices[0]?.options.some(
      (item) => item.id === RUN_TASK_CONFIRM_OPTION_ID,
    ),
  ).toBe(true)
})

test('enqueue_task dispatches high-cost task after explicit confirmation event', async () => {
  const runtime = await createRuntime()
  const workerPrompt = 'x'.repeat(1300)
  const title = 'high-cost task'
  const goal = 'Deliver all outputs'
  const scope = 'Cross-module full implementation'
  const acceptance = ['A', 'B', 'C']
  const choiceId = buildRunTaskConfirmationId({
    prompt: workerPrompt,
    title,
    goal,
    scope,
    acceptance,
  })
  runtime.session.inflightInputs.push({
    id: 'input-choice-confirmed',
    role: 'system',
    visibility: 'all',
    focusId: GLOBAL_FOCUS_ID,
    createdAt: '2026-03-08T00:00:00.000Z',
    text: 'Selected option "Continue" for this task.',
    systemEventName: 'user_choice',
    systemEventPayload: {
      choice_id: choiceId,
      selected_option_id: RUN_TASK_CONFIRM_OPTION_ID,
    },
  })

  await applyTaskActions(runtime, [
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: workerPrompt,
        title,
        cwd: TASK_CWD,
        goal,
        in_scope: scope,
        done_when_1: acceptance[0] ?? 'A',
        done_when_2: acceptance[1] ?? 'B',
        done_when_3: acceptance[2] ?? 'C',
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
        worker_prompt: 'x'.repeat(1300),
        title: 'high-cost task',
        cwd: TASK_CWD,
        goal: 'Deliver all outputs',
        in_scope: 'Cross-module full implementation',
        done_when_1: 'A',
        done_when_2: 'B',
        done_when_3: 'C',
      },
    },
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'small task',
        title: 'small-task',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.ui.pendingUserChoices).toHaveLength(1)
  expect(runtime.tasks).toHaveLength(0)
})

test('mutate_task with op=pause marks pending task as paused', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-pause-target',
    fingerprint: 'pause fp',
    prompt: 'pause prompt',
    title: 'pause title',
    cwd: TASK_CWD,
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
    cwd: TASK_CWD,
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
  expect(runtime.worker.queue.size).toBe(1)
})

test('mutate_task with op=cancel marks paused task as canceled', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-cancel-target',
    fingerprint: 'cancel fp',
    prompt: 'cancel prompt',
    title: 'cancel title',
    cwd: TASK_CWD,
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
        worker_prompt: 'this should not run before user picks',
        title: 'blocked by pending choice',
        cwd: TASK_CWD,
        ...CONTRACT_ATTRS,
      },
    },
  ])

  expect(runtime.ui.pendingUserChoices).toHaveLength(1)
  expect(runtime.ui.pendingUserChoices[0]?.id).toBe('choice-delivery')
  expect(runtime.ui.pendingUserChoices[0]?.options).toHaveLength(2)
  expect(runtime.ui.pendingUserChoices[0]?.options[0]?.reason).toBe(
    'Need full context',
  )
  expect(runtime.tasks).toHaveLength(0)
})

test('ask_user_choice appends a new pending choice instead of overwriting existing one', async () => {
  const runtime = await createRuntime()
  runtime.ui.pendingUserChoices = [
    {
      id: 'choice-existing',
      question: 'Existing',
      options: [
        { id: 'option-a', label: 'A', reason: 'reason-a' },
        { id: 'option-b', label: 'B', reason: 'reason-b' },
      ],
      defaultOptionId: 'option-a',
      createdAt: '2026-03-08T00:00:00.000Z',
      focusId: GLOBAL_FOCUS_ID,
    },
  ]

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
  ])

  expect(runtime.ui.pendingUserChoices.map((item) => item.id)).toEqual([
    'choice-existing',
    'choice-delivery',
  ])
})

test('create_plan uses worker profile for cron plan', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_plan',
      attrs: {
        title: 'scheduled',
        schedule_type: 'cron',
        cron_expr: '0 0 9 * * *',
        time_zone: 'Asia/Shanghai',
        effect_kind: 'enqueue_task',
        task_title: 'scheduled task',
        task_cwd: TASK_CWD,
        task_goal: 'Summarize daily build status',
        task_in_scope: 'Review the latest build state and produce a summary',
        task_done_when_1: 'A concise build status summary is ready',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('cron')
  expect(runtime.taskPlans[0]?.trigger).toMatchObject({
    timeZone: 'Asia/Shanghai',
  })
  expect(runtime.taskPlans[0]?.effect).toMatchObject({
    kind: 'enqueue_task',
    taskTemplate: {
      title: 'scheduled task',
      cwd: TASK_CWD,
      contract: {
        goal: 'Summarize daily build status',
      },
    },
  })
})

test('create_plan accepts on_worker_slot_freed trigger mode', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      name: 'create_plan',
      attrs: {
        title: 'capacity trigger',
        schedule_type: 'on_worker_slot_freed',
        effect_kind: 'wake_manager',
        effect_reason: 'capacity_retry',
      },
    },
  ])

  expect(runtime.taskPlans).toHaveLength(1)
  expect(runtime.taskPlans[0]?.trigger.mode).toBe('on_worker_slot_freed')
  expect(runtime.taskPlans[0]?.effect).toEqual({
    kind: 'wake_manager',
    reason: 'capacity_retry',
  })
})

test('assign_focus updates task focus by explicit target_type', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push({
    id: 'task-focus-1',
    fingerprint: 'fp-1',
    prompt: 'do something',
    title: 'focus task',
    cwd: TASK_CWD,
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
  expect(focus?.summary).toBe('Track release readiness')
  expect(focus?.openItems).toEqual(['确认回滚路径', '补齐发布清单'])
})

test('delete_plan removes done plan', async () => {
  const runtime = await createRuntime()
  const donePlan: TaskPlan = {
    id: 'plan-done',
    title: 'done',
    focusId: GLOBAL_FOCUS_ID,
    priority: 'normal',
    status: 'done',
    trigger: {
      mode: 'on_worker_slot_freed',
    },
    effect: {
      kind: 'wake_manager',
      reason: 'capacity_retry',
    },
    createdAt: '2026-02-13T00:00:00.000Z',
    updatedAt: '2026-02-13T00:00:00.000Z',
    maxRuns: 1,
    runtime: {
      runCount: 1,
      closedAt: '2026-02-13T00:00:00.000Z',
      doneReason: 'completed',
    },
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
      item.systemEventName === 'memory_remembered',
  )
  expect(event).toBeTruthy()
  expect(event?.systemEventPayload?.operation).toBe('created')
  expect(typeof event?.systemEventPayload?.entry_id).toBe('string')
})
