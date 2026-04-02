import { expect, test } from 'vitest'

import {
  collectManagerActionFeedback,
  collectManagerActionValidationOutcome,
} from '../src/policy/manager/action-feedback-collect.js'

import type { UserInput } from '../src/foundation/types/index.js'

const createUserInput = (text: string): UserInput => ({
  id: 'input-user',
  role: 'user',
  text,
  createdAt: '2026-03-20T08:00:00.000Z',
  focusId: 'focus-inbox',
})

test('remember_memory suppresses unstable multiline process text instead of surfacing reply-breaking feedback', () => {
  const outcome = collectManagerActionValidationOutcome(
    [
      {
        type: 'remember_memory',
        content:
          'Keep this for later:\n- finish task-refactor-auth\n- rerun review-code-changes',
        source_input_id: 'input-user',
        source_quote:
          'Keep this for later:\n- finish task-refactor-auth\n- rerun review-code-changes',
      },
    ],
    {
      inputs: [
        createUserInput(
          '请记住下面这段执行过程：Keep this for later:\n- finish task-refactor-auth\n- rerun review-code-changes',
        ),
      ],
    },
  )

  expect(outcome.feedback).toHaveLength(0)
  expect(outcome.suppressedActionIndexes).toEqual([0])
})

test('remember_memory suppresses runtime object references instead of surfacing reply-breaking feedback', () => {
  const outcome = collectManagerActionValidationOutcome(
    [
      {
        type: 'remember_memory',
        content: 'Keep task-refactor-auth paused until review finishes.',
        source_input_id: 'input-user',
        source_quote: 'Keep task-refactor-auth paused until review finishes.',
      },
    ],
    {
      inputs: [
        createUserInput(
          '请记住：Keep task-refactor-auth paused until review finishes.',
        ),
      ],
    },
  )

  expect(outcome.feedback).toHaveLength(0)
  expect(outcome.suppressedActionIndexes).toEqual([0])
})

test('remember_memory suppresses unmatched source_input_id instead of surfacing auxiliary write failure', () => {
  const outcome = collectManagerActionValidationOutcome(
    [
      {
        type: 'remember_memory',
        content: 'Always keep replies concise and in Chinese.',
        source_input_id: 'input-other',
      },
    ],
    {
      inputs: [createUserInput('先总结一下当前实现状态。')],
    },
  )

  expect(outcome.feedback).toHaveLength(0)
  expect(outcome.suppressedActionIndexes).toEqual([0])
})

test('remember_memory requires current user input provenance fields', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_memory',
        content: 'Always keep replies concise and in Chinese.',
      },
    ],
    {
      inputs: [
        createUserInput(
          '后续都请保持中文且简洁回复。Always keep replies concise and in Chinese.',
        ),
      ],
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('remember_memory')
  expect(feedback[0]?.error).toBe('invalid_action_args')
})

test('remember_memory stays allowed for direct stable preference evidence', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_memory',
        content: 'Always keep replies concise and in Chinese.',
        source_input_id: 'input-user',
      },
    ],
    {
      inputs: [
        createUserInput(
          '后续都请保持中文且简洁回复。Always keep replies concise and in Chinese.',
        ),
      ],
    },
  )

  expect(feedback).toHaveLength(0)
})

test('remember_memory still accepts optional source_quote when provided', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_memory',
        content: 'Always keep replies concise.',
        source_input_id: 'input-user',
        source_quote: '后续都请保持回复简洁',
      },
    ],
    { inputs: [createUserInput('后续都请保持回复简洁，不要展开成长篇大论。')] },
  )

  expect(feedback).toHaveLength(0)
})
