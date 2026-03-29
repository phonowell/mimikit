import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

test('enqueue_task rejects in-repo write tasks that bypass worktree closure', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: 'Tighten manager rules',
          cwd: '/repo/mimikit/src/policy/manager',
          mode: 'write',
          use_worktree: false,
          goal: '固化 manager 执行规则',
          in_scope: ['只改 manager prompt 与 guard'],
          out_of_scope: [],
          done_when: ['仓库内规则固化完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      startupWorktree: '/repo/mimikit',
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('enqueue_task')
  expect(feedback[0]?.hint).toContain('use_worktree=true')
  expect(feedback[0]?.hint).toContain('review/merge/cleanup')
})

test('enqueue_task allows in-repo write tasks when worktree closure is enabled', () => {
  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: 'Tighten manager rules',
          cwd: '/repo/mimikit/src/policy/manager',
          mode: 'write',
          use_worktree: true,
          goal: '固化 manager 执行规则',
          in_scope: ['只改 manager prompt 与 guard'],
          out_of_scope: [],
          done_when: ['仓库内规则固化完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      startupWorktree: '/repo/mimikit',
    },
  )

  expect(feedback).toHaveLength(0)
})

test('enqueue_task rejects same-batch overlapping cwd fan-out', () => {
  const feedback = collectManagerActionFeedback([
    {
      type: 'enqueue_task',
      task: {
        title: 'Rule docs',
        cwd: '/repo/mimikit/src/policy',
        mode: 'read',
        use_worktree: false,
        goal: '回读 policy 层',
        in_scope: ['只读 manager policy'],
        out_of_scope: [],
        done_when: ['列出 policy 事实'],
        context_refs: [],
        instructions: [],
      },
    },
    {
      type: 'enqueue_task',
      task: {
        title: 'Rule prompt docs',
        cwd: '/repo/mimikit/src/policy/prompts',
        mode: 'read',
        use_worktree: false,
        goal: '回读 prompt 层',
        in_scope: ['只读 manager prompt'],
        out_of_scope: [],
        done_when: ['列出 prompt 事实'],
        context_refs: [],
        instructions: [],
      },
    },
  ])

  expect(feedback).toHaveLength(2)
  for (const item of feedback) {
    expect(item.action).toBe('enqueue_task')
    expect(item.hint).toContain('默认按粗粒度派单')
    expect(item.hint).toContain('/repo/mimikit/src/policy')
  }
})

test('enqueue_task allows same-batch fan-out when cwd boundaries are disjoint', () => {
  const feedback = collectManagerActionFeedback([
    {
      type: 'enqueue_task',
      task: {
        title: 'Policy scan',
        cwd: '/repo/mimikit/src/policy',
        mode: 'read',
        use_worktree: false,
        goal: '回读 policy 层',
        in_scope: ['只读 manager policy'],
        out_of_scope: [],
        done_when: ['列出 policy 事实'],
        context_refs: [],
        instructions: [],
      },
    },
    {
      type: 'enqueue_task',
      task: {
        title: 'WebUI scan',
        cwd: '/repo/mimikit/webui',
        mode: 'read',
        use_worktree: false,
        goal: '回读 webui 层',
        in_scope: ['只读 webui'],
        out_of_scope: [],
        done_when: ['列出 webui 事实'],
        context_refs: [],
        instructions: [],
      },
    },
  ])

  expect(feedback).toHaveLength(0)
})
