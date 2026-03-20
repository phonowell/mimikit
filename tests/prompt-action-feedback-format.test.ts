import { expect, test } from 'vitest'

import { buildActionFeedbackPromptPayload } from '../src/prompts/format-messages.js'

test('buildActionFeedbackPromptPayload emits structured repair hints for invalid args', () => {
  const payload = buildActionFeedbackPromptPayload([
    {
      action: 'enqueue_task',
      error: 'invalid_action_args',
      hint: '参数校验失败：worker_prompt: Invalid input: expected string, received undefined；(root): Unrecognized keys: "legacy_prompt"',
    },
  ])

  expect(payload).toEqual({
    items: [
      {
        action: 'enqueue_task',
        error: 'invalid_action_args',
        hint:
          '参数校验失败：worker_prompt: Invalid input: expected string, received undefined；(root): Unrecognized keys: "legacy_prompt"',
        repair: {
          kind: 'fix_action_args',
          issues: [
            'worker_prompt: Invalid input: expected string, received undefined',
            '(root): Unrecognized keys: "legacy_prompt"',
          ],
          missing_required_attr: 'worker_prompt',
          missing_required_attrs: ['worker_prompt'],
          unknown_attrs: ['legacy_prompt'],
        },
      },
    ],
  })
})

test('buildActionFeedbackPromptPayload marks syntax feedback as action markup repair', () => {
  const payload = buildActionFeedbackPromptPayload([
    {
      action: 'create_plan',
      error: 'invalid_action_syntax',
      hint: 'Detected M:action markup but no executable action was parsed.',
    },
  ])

  expect(payload?.items[0]).toMatchObject({
    action: 'create_plan',
    error: 'invalid_action_syntax',
    repair: {
      kind: 'fix_action_markup',
    },
  })
})
