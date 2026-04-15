import { expect, test } from 'vitest'

import { collectManagerActionValidationOutcome } from '../../src/policy/manager/action-feedback-collect.js'

test('assign_focus suppresses malformed auxiliary focus writes instead of surfacing invalid_action_args', () => {
  const outcome = collectManagerActionValidationOutcome([
    {
      type: 'assign_focus',
      target_id: 'task-1',
      focus_id: 'focus-demo',
    },
  ] as never)

  expect(outcome.feedback).toHaveLength(0)
  expect(outcome.suppressedActionIndexes).toEqual([0])
})

test('assign_focus suppresses missing task targets instead of surfacing auxiliary write failure', () => {
  const outcome = collectManagerActionValidationOutcome(
    [
      {
        type: 'assign_focus',
        target_type: 'task',
        target_id: 'task-missing',
        focus_id: 'focus-demo',
      },
    ],
    {
      taskById: new Map(),
    },
  )

  expect(outcome.feedback).toHaveLength(0)
  expect(outcome.suppressedActionIndexes).toEqual([0])
})
