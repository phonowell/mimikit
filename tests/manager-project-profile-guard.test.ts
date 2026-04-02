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

test('remember_project_profile stays allowed for repo-bound digest with current-input provenance only', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_project_profile',
        content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
        source_input_id: 'input-user',
      },
    ],
    {
      inputs: [
        createUserInput(
          '这个仓库后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本。',
        ),
      ],
    },
  )

  expect(feedback).toHaveLength(0)
})

test('remember_project_profile suppresses unmatched source_input_id instead of surfacing auxiliary write failure', () => {
  const outcome = collectManagerActionValidationOutcome(
    [
      {
        type: 'remember_project_profile',
        content: '当前阶段先只收敛 manager，不动 worker。',
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

test('remember_project_profile still accepts optional source_quote when provided', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_project_profile',
        content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
        source_input_id: 'input-user',
        source_quote: '统一用 pnpm + tsx 命令',
      },
    ],
    {
      inputs: [
        createUserInput(
          '这个仓库后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本。',
        ),
      ],
    },
  )

  expect(feedback).toHaveLength(0)
})
