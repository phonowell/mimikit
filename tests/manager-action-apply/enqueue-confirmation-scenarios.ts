import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import {
  buildRunTaskConfirmationId,
  RUN_TASK_CONFIRM_OPTION_ID,
} from '../../src/policy/manager/run-task-confirmation.js'

import { CONTRACT_ATTRS, createRuntime, TASK_CWD } from './testkit.js'

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
