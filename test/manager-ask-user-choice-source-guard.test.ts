import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

test('ask_user_choice is rejected when qq source does not support choice callback', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'ask_user_choice',
        attrs: {
          id: 'choice-format',
          question: 'choose format',
          options_json:
            '[{"id":"option-a","label":"A","reason":"alpha"},{"id":"option-b","label":"B","reason":"beta"}]',
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
  expect(feedback[0]?.hint).toContain('QQ')
})
