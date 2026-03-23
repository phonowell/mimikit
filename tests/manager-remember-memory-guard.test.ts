import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/manager/action-feedback-collect.js'

import type { UserInput } from '../src/types/index.js'

const createUserInput = (text: string): UserInput => ({
  id: 'input-user',
  role: 'user',
  text,
  createdAt: '2026-03-20T08:00:00.000Z',
  focusId: 'focus-inbox',
})

test('remember_memory is blocked for unstable multiline process text', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'remember_memory',
        attrs: {
          content:
            'Keep this for later:\n- finish task-refactor-auth\n- rerun review-code-changes',
        },
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

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('remember_memory')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('单行稳定规则/偏好 digest')
})

test('remember_memory is blocked for runtime object references', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'remember_memory',
        attrs: {
          content: 'Keep task-refactor-auth paused until review finishes.',
        },
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

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('remember_memory')
  expect(feedback[0]?.hint).toContain('运行时对象引用')
})

test('remember_memory is blocked without direct user evidence even when no supplemental evidence exists', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'remember_memory',
        attrs: {
          content: 'Always keep replies concise and in Chinese.',
        },
      },
    ],
    {
      inputs: [createUserInput('先总结一下当前实现状态。')],
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('remember_memory')
  expect(feedback[0]?.error).toBe('action_execution_rejected')
  expect(feedback[0]?.hint).toContain('intent-evidence guard 未通过')
})

test('remember_memory stays allowed for direct stable preference evidence', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'remember_memory',
        attrs: {
          content: 'Always keep replies concise and in Chinese.',
        },
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
