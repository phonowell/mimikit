import { expect, test } from 'vitest'

import { buildActionFeedbackPromptPayload } from '../src/foundation/prompting/format-action-feedback.js'

test('buildActionFeedbackPromptPayload keeps structured repair metadata without parsing hint text', () => {
  const payload = buildActionFeedbackPromptPayload([
    {
      action: 'enqueue_task',
      error: 'invalid_action_args',
      hint: '任意展示文案',
      code: 'invalid_action_args',
      repair: {
        kind: 'fix_action_args',
        issues: ['worker_prompt: Invalid input: expected string, received undefined'],
        missing_required_attr: 'worker_prompt',
        missing_required_attrs: ['worker_prompt'],
      },
    },
  ])

  expect(payload).toEqual({
    items: [
      {
        action: 'enqueue_task',
        error: 'invalid_action_args',
        hint: '任意展示文案',
        code: 'invalid_action_args',
        repair: {
          kind: 'fix_action_args',
          issues: [
            'worker_prompt: Invalid input: expected string, received undefined',
          ],
          missing_required_attr: 'worker_prompt',
          missing_required_attrs: ['worker_prompt'],
        },
      },
    ],
  })
})
