import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../../src/policy/manager/action-feedback-collect.js'

test('set_plan rejects past scheduled_at values', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: null,
        plan: {
          title: 'past plan',
          trigger: {
            type: 'scheduled_at',
            scheduled_at: '2026-03-20T00:00:00.000Z',
          },
          task: {
            title: 'task',
            cwd: '/tmp/task',
            mode: 'write',
            goal: 'ship',
            in_scope: ['frontend only'],
            out_of_scope: [],
            done_when: ['tests pass'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: 1,
        },
      },
    ],
    {
      scheduleNowIso: '2026-03-21T00:00:00.000Z',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('scheduled_at')
})

test('set_plan rejects replacing a done plan', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'set_plan',
        plan_id: 'plan-1',
        plan: {
          title: 'replace plan',
          trigger: {
            type: 'on_worker_slot_freed',
          },
          task: {
            title: 'task',
            cwd: '/tmp/task',
            mode: 'write',
            goal: 'ship',
            in_scope: ['frontend only'],
            out_of_scope: [],
            done_when: ['tests pass'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: 1,
        },
      },
    ],
    {
      planStatusById: new Map([['plan-1', 'done']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_plan')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('done plan')
})

test('task_control rejects pause when task is already paused', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: 'task-1',
        action: 'pause',
        instructions: [],
      },
    ],
    {
      taskStatusById: new Map([['task-1', 'paused']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('task_control')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('paused')
})
