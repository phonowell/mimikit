import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

test('ask_user_choice is rejected when telegram source does not support choice callback', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'ask_user_choice',
        attrs: {
          id: 'choice-format',
          question: 'choose format',
          option_1_id: 'option-a',
          option_1_label: 'A',
          option_1_reason: 'alpha',
          option_2_id: 'option-b',
          option_2_label: 'B',
          option_2_reason: 'beta',
          default_option_id: 'option-a',
        },
      },
    ],
    {
      allowAskUserChoice: false,
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('ask_user_choice')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('Telegram/Feishu')
})

test('ask_user_choice rejects non-contiguous option indices', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'ask_user_choice',
      attrs: {
        id: 'choice-format',
        question: 'choose format',
        option_1_id: 'option-a',
        option_1_label: 'A',
        option_1_reason: 'alpha',
        option_3_id: 'option-b',
        option_3_label: 'B',
        option_3_reason: 'beta',
        default_option_id: 'option-a',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('ask_user_choice')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('连续递增')
})

test('set_task_result_summary rejects task_id outside current batch results', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'set_task_result_summary',
        attrs: {
          task_id: 'task-other',
          summary: 'done',
        },
      },
    ],
    {
      resultTaskIds: new Set(['task-current']),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('set_task_result_summary')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('task_id 不在当前批次结果中')
})

test('assign_focus requires explicit target_type', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'assign_focus',
      attrs: {
        target_id: 'task-1',
        focus_id: 'focus-demo',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('assign_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('target_type')
})

test('upsert_focus rejects json-shaped open_items payload', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-demo',
        open_items: '["a","b"]',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('upsert_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('open_items')
})

test('upsert_focus rejects non-contiguous open_item indices', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'upsert_focus',
      attrs: {
        id: 'focus-demo',
        open_item_1: 'a',
        open_item_3: 'b',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('upsert_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('contiguously')
})

test('update_plan requires schedule_type when patching cron_expr/scheduled_at fields', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'update_plan',
        attrs: {
          id: 'plan-1',
          cron_expr: '*/5 * * * *',
        },
      },
    ],
    {
      planStatusById: new Map([['plan-1', 'active']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('update_plan')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('schedule_type')
})

test('mutate_task rejects pause when task is already paused', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: 'task-1',
          op: 'pause',
        },
      },
    ],
    {
      taskStatusById: new Map([['task-1', 'paused']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('mutate_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('paused')
})

test('mutate_task rejects resume when task is pending', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: {
          id: 'task-2',
          op: 'resume',
        },
      },
    ],
    {
      taskStatusById: new Map([['task-2', 'pending']]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('mutate_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('无法 resume')
})

test('enqueue_task rejects unexpected provider attr', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'run with free provider',
          title: 'use codex',
          cwd: '/tmp/use-codex',
          goal: 'Run worker task',
          in_scope: 'Single task',
          done_when_1: 'Produce output',
          provider: 'codex',
        },
      },
    ],
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('provider')
})

test('enqueue_task rejects missing task contract attrs', () => {
  const feedback = collectManagerActionFeedback([
    {
      name: 'enqueue_task',
      attrs: {
        worker_prompt: 'run task',
        title: 'missing contract',
        cwd: '/tmp/missing-contract',
      },
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('每项一句即可')
  expect(feedback[0]?.hint).toContain('worker_prompt=')
  expect(feedback[0]?.hint).toContain('out_of_scope=')
})

test('enqueue_task high-cost payload requires user confirmation first', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'enqueue_task',
        attrs: {
          worker_prompt: 'x'.repeat(1300),
          title: 'high-cost',
          cwd: '/tmp/high-cost-task',
          goal: 'Ship high-cost task',
          in_scope: 'All modules',
          done_when_1: 'A',
          done_when_2: 'B',
          done_when_3: 'C',
        },
      },
    ],
    {
      confirmedRunTaskChoiceIds: new Set(),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('高成本长任务')
})
