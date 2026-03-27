import { expect, test } from 'vitest'

import { GLOBAL_FOCUS_ID } from '../../src/work/focus/constants.js'
import { applyTaskActions } from '../../src/policy/manager/action-apply.js'
import { materializeTaskFixture } from '../helpers/execution-spec.js'

import { TASK_CWD, buildTaskDraft, createRuntime } from './testkit.js'

test('task_control pause marks pending task as paused', async () => {
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
      type: 'task_control',
      task_id: 'task-pause-target',
      action: 'pause',
      instructions: [],
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('paused')
  expect(runtime.tasks[0]?.pausedAt).toBeTypeOf('string')
})

test('task_control resume requeues paused task', async () => {
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
      type: 'task_control',
      task_id: 'task-resume-target',
      action: 'resume',
      instructions: ['继续执行并产出最终结果'],
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('pending')
  expect(runtime.tasks[0]?.pausedAt).toBeUndefined()
  expect(runtime.worker.queue.size).toBe(1)
})

test('task_control cancel marks paused task as canceled', async () => {
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
      type: 'task_control',
      task_id: 'task-cancel-target',
      action: 'cancel',
      instructions: [],
    },
  ])

  expect(runtime.tasks[0]?.status).toBe('canceled')
  expect(runtime.tasks[0]?.completedAt).toBeTypeOf('string')
})

test('ask_user_choice stores pending choice and stops later actions in same batch', async () => {
  const runtime = await createRuntime()
  await applyTaskActions(runtime, [
    {
      type: 'ask_user_choice',
      question: 'Choose output format',
      default_option_id: 'option-report',
      options: [
        {
          id: 'option-report',
          label: 'Report',
          reason: 'Need full context',
        },
        {
          id: 'option-checklist',
          label: 'Checklist',
          reason: 'Need quick execution',
        },
      ],
    },
    {
      type: 'enqueue_task',
      task: buildTaskDraft({
        title: 'blocked by pending choice',
        instructions: ['this should not run before user picks'],
      }),
    },
  ])

  expect(runtime.ui.pendingUserChoices).toHaveLength(1)
  expect(runtime.ui.pendingUserChoices[0]?.id).toMatch(/^choice-/)
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
      type: 'ask_user_choice',
      question: 'Choose output format',
      default_option_id: 'option-report',
      options: [
        {
          id: 'option-report',
          label: 'Report',
          reason: 'Need full context',
        },
        {
          id: 'option-checklist',
          label: 'Checklist',
          reason: 'Need quick execution',
        },
      ],
    },
  ])

  expect(runtime.ui.pendingUserChoices).toHaveLength(2)
  expect(runtime.ui.pendingUserChoices[0]?.id).toBe('choice-existing')
  expect(runtime.ui.pendingUserChoices[1]?.id).toMatch(/^choice-/)
})
