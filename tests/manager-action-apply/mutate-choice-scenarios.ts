import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { materializeTaskFixture } from '../helpers/execution-spec.js'

import { CONTRACT_ATTRS, createRuntime, TASK_CWD } from './testkit.js'

test('mutate_task with op=pause marks pending task as paused', async () => {
  const runtime = await createRuntime()
  runtime.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-pause-target',
        prompt: 'pause prompt',
        title: 'pause title',
        cwd: TASK_CWD,
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        provider: 'codex',
        status: 'pending',
        createdAt: '2026-02-13T00:00:00.000Z',
      },
    }),
  )

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
  runtime.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-resume-target',
        prompt: 'resume prompt',
        title: 'resume title',
        cwd: TASK_CWD,
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        provider: 'codex',
        status: 'paused',
        createdAt: '2026-02-13T00:00:00.000Z',
        pausedAt: '2026-02-13T00:10:00.000Z',
      },
    }),
  )

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
  runtime.tasks.push(
    await materializeTaskFixture({
      stateDir: runtime.config.workDir,
      task: {
        id: 'task-cancel-target',
        prompt: 'cancel prompt',
        title: 'cancel title',
        cwd: TASK_CWD,
        focusId: GLOBAL_FOCUS_ID,
        profile: 'worker',
        provider: 'codex',
        status: 'paused',
        createdAt: '2026-02-13T00:00:00.000Z',
        pausedAt: '2026-02-13T00:10:00.000Z',
      },
    }),
  )

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
