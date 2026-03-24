import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../../src/policy/manager/action-feedback-collect.js'

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
