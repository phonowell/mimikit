import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../../src/policy/manager/action-feedback-collect.js'

test('ask_user_choice is rejected when telegram source does not support choice callback', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'ask_user_choice',
        question: 'choose format',
        default_option_id: 'option-a',
        options: [
          { id: 'option-a', label: 'A', reason: 'alpha' },
          { id: 'option-b', label: 'B', reason: 'beta' },
        ],
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

test('ask_user_choice rejects default option ids outside options', () => {
  const feedback = collectManagerActionFeedback([
    {
      type: 'ask_user_choice',
      question: 'choose format',
      default_option_id: 'option-c',
      options: [
        { id: 'option-a', label: 'A', reason: 'alpha' },
        { id: 'option-b', label: 'B', reason: 'beta' },
      ],
    },
  ])

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('ask_user_choice')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('default_option_id')
})

test('assign_focus requires explicit target_type', () => {
  const feedback = collectManagerActionFeedback([
    {
      type: 'assign_focus',
      target_id: 'task-1',
      focus_id: 'focus-demo',
    },
  ] as never)

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('assign_focus')
  expect(feedback[0]?.error).toBe('invalid_action_args')
  expect(feedback[0]?.hint).toContain('target_type')
})
