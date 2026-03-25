import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'
import { buildTaskFingerprint } from '../src/work/orchestrator/task-state.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceTaskContext,
  createIntentEvidenceUserInput,
  expectSingleRejectedFeedback,
} from './helpers/manager-intent-evidence.js'

test('mutate_task cancel stays allowed for same-focus replacement batch', () => {
  const task = createIntentEvidenceTask({
    title: '修复 WebUI restart 与 scroll-bottom',
    cwd: '/repo/mimikit',
    fingerprint: buildTaskFingerprint({
      prompt: '复现并修复 WebUI restart 与 scroll-bottom',
      title: '修复 WebUI restart 与 scroll-bottom',
      cwd: '/repo/mimikit',
      profile: 'worker',
      provider: 'codex',
      focusId: 'focus-inbox',
      contract: {
        goal: '复现并修复两个 WebUI 问题',
        scope: '端到端修复与验证',
        acceptance: ['问题已修复'],
      },
    }),
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: { id: task.id, op: 'cancel' },
      },
      {
        name: 'enqueue_task',
        attrs: {
          title: '仅做 WebUI restart 与 scroll-bottom 的代码审查',
          cwd: '/repo/mimikit',
          goal: '只对 WebUI restart 与 scroll-bottom 做代码审查',
          in_scope: '阅读相关代码并给出审查结论',
          done_when_1: '输出代码审查结论，不做修复',
        },
      },
    ],
    {
      ...createIntentEvidenceTaskContext(task, [
        createIntentEvidenceUserInput(
          '不要继续刚才那个端到端修复了，改成只做 WebUI restart 与 scroll-bottom 的代码审查。',
        ),
      ]),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('mutate_task cancel stays blocked when accompanying enqueue task is unrelated even in same focus and cwd', () => {
  const task = createIntentEvidenceTask({
    title: '修复 WebUI restart 与 scroll-bottom',
    cwd: '/repo/mimikit',
  })
  const feedback = collectManagerActionFeedback(
    [
      {
        name: 'mutate_task',
        attrs: { id: task.id, op: 'cancel' },
      },
      {
        name: 'enqueue_task',
        attrs: {
          title: '检查 Telegram 广播失败',
          cwd: '/repo/mimikit',
          goal: '检查 Telegram 广播失败的原因',
          in_scope: '阅读相关代码与日志',
          done_when_1: '输出广播失败原因',
        },
      },
    ],
    {
      ...createIntentEvidenceTaskContext(task, [
        createIntentEvidenceUserInput(
          '请检查 Telegram 广播失败的原因，只阅读相关代码与日志，并输出广播失败原因。',
        ),
      ]),
      defaultFocusId: 'focus-inbox',
    },
  )

  expectSingleRejectedFeedback(feedback, {
    action: 'mutate_task',
    error: 'action_execution_rejected',
    hintIncludes: ['intent-evidence guard 未通过', task.id],
  })
})
