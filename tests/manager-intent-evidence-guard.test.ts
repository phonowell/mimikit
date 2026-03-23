import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

import type { Task, UserInput } from '../src/types/index.js'

const createUserInput = (text: string): UserInput => ({
  id: 'input-user',
  role: 'user',
  text,
  createdAt: '2026-03-20T08:00:00.000Z',
  focusId: 'focus-inbox',
})

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-refactor-auth',
  fingerprint: 'task-refactor-auth-fingerprint',
  prompt: 'Refactor auth guard',
  title: 'Refactor auth guard',
  cwd: '/repo/auth-guard',
  focusId: 'focus-inbox',
  profile: 'worker',
  provider: 'codex',
  status: 'running',
  createdAt: '2026-03-20T08:00:00.000Z',
  ...overrides,
})

test('enqueue_task is blocked when only supplemental evidence suggests new work', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          title: 'Implement intent evidence guard',
          cwd: '/repo/mimikit',
          goal: 'Add an intent-evidence guard for manager high-risk actions',
          in_scope: 'Validation and feedback flow only',
          done_when_1: 'Guard blocks unsupported risky actions',
        },
      },
    ],
    {
      inputs: [createUserInput('先总结当前状态，不要开始新任务。')],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
  expect(feedback[0]?.hint).toContain('task_result')
})

test('enqueue_task stays allowed when current user input directly supports it', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          title: 'Implement intent evidence guard',
          cwd: '/repo/mimikit',
          goal: 'Implement intent evidence guard for manager high-risk actions',
          in_scope: 'Touch validation and feedback flow only',
          done_when_1: 'Guard blocks unsupported risky actions',
        },
      },
    ],
    {
      inputs: [
        createUserInput(
          '请实现 intent evidence guard，只改 manager validation and feedback flow，并确保能拦住 unsupported risky actions。',
        ),
      ],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('mutate_task is blocked when user input does not identify the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'cancel',
        },
      },
    ],
    {
      inputs: [createUserInput('先看看文档里怎么说。')],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('mutate_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
  expect(feedback[0]?.hint).toContain(task.id)
})

test('mutate_task stays allowed when user explicitly references the task', () => {
  const task = createTask()
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'cancel',
        },
      },
    ],
    {
      inputs: [createUserInput(`请取消 ${task.id}，也就是 ${task.title}。`)],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(0)
})
