import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import type { UserInput } from '../src/foundation/types/index.js'

const createUserInput = (text: string): UserInput => ({
  id: 'input-user',
  role: 'user',
  text,
  createdAt: '2026-03-20T08:00:00.000Z',
  focusId: 'focus-inbox',
})

test('remember_project_profile stays allowed for repo-bound digest anchored by source quote', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_project_profile',
        content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
        source_input_id: 'input-user',
        source_quote: '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
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

test('remember_project_profile is silently suppressed when source quote is not in the current user input', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_project_profile',
        content: '当前阶段先只收敛 manager，不动 worker。',
        source_input_id: 'input-user',
        source_quote: '先只收敛 manager，不动 worker',
      },
    ],
    {
      inputs: [createUserInput('先总结一下当前实现状态。')],
    },
  )

  expect(feedback).toHaveLength(0)
})

test('remember_project_profile is silently suppressed when content is not supported by the current user input', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'remember_project_profile',
        content: '本仓库默认跳过所有测试并直接合并。',
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
