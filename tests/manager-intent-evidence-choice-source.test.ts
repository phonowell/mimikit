import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import type { Task, UserInput } from '../src/foundation/types/index.js'

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

const createChoiceInput = (params: {
  text: string
  source: 'user' | 'timeout'
  taskId?: string
}): UserInput => ({
  id: `input-choice-${params.source}`,
  role: 'system',
  visibility: 'all',
  text: params.text,
  createdAt: '2026-03-20T08:00:00.000Z',
  focusId: 'focus-inbox',
  systemEventName: 'user_choice',
  systemEventPayload: {
    source: params.source,
    ...(params.taskId
      ? {
          choice_effect_type: 'resume_task',
          choice_effect_task_id: params.taskId,
        }
      : {}),
  },
})

test('mutate_task resume stays allowed for matching resume choice effect', () => {
  const task = createTask({ status: 'paused' })
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: task.id,
          op: 'resume',
        },
      },
    ],
    {
      inputs: [
        createChoiceInput({
          text: 'Selected option "Resume" for "Continue this task?".',
          source: 'user',
          taskId: task.id,
        }),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(feedback).toHaveLength(0)
})

test('mutate_task cancel stays blocked for resume-only choice effect', () => {
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
      inputs: [
        createChoiceInput({
          text: 'Selected option "Resume" for "Continue this task?".',
          source: 'user',
          taskId: task.id,
        }),
      ],
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('mutate_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
})

test('enqueue_task stays blocked when only timeout choice text suggests new work', () => {
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
        createChoiceInput({
          text: 'Selected option "Implement intent evidence guard" for "What should happen next?".',
          source: 'timeout',
        }),
      ],
      supplementalEvidenceSources: new Set(['task_result']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
})
