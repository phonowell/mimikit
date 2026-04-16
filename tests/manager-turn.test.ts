import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

test('parseManagerTurn keeps structured actions as the single execution shape', () => {
  const parsed = parseManagerTurn({
    reply: '开始执行',
    actions: [
      {
        type: 'enqueue_task',
        task: {
          title: '实现 actions v2',
          cwd: '/tmp/mimikit',
          mode: 'write',
          goal: '切到单一真相源 action 协议',
          in_scope: ['manager action schema', 'validation', 'apply'],
          out_of_scope: ['worker handoff'],
          done_when: ['不再存在 attrs 中间层'],
          context_refs: ['docs/design/workflow/action.md'],
          instructions: ['只改 manager 编排层'],
        },
      },
      {
        type: 'set_plan',
        plan_id: null,
        plan: {
          title: '空闲时继续收敛协议',
          trigger: { type: 'on_worker_slot_freed' },
          task: {
            title: '继续收敛 actions v2',
            cwd: '/tmp/mimikit',
            mode: 'read',
            goal: '继续评审和收敛协议',
            in_scope: ['manager action 设计'],
            out_of_scope: [],
            done_when: ['输出下一轮结论'],
            context_refs: [],
            instructions: [],
          },
          priority: 'normal',
          max_runs: 5,
        },
      },
    ],
  })

  expect(parsed.reply).toBe('开始执行')
  expect(parsed.actions).toEqual([
    {
      type: 'enqueue_task',
      task: {
        title: '实现 actions v2',
        cwd: '/tmp/mimikit',
        mode: 'write',
        use_worktree: false,
        goal: '切到单一真相源 action 协议',
        in_scope: ['manager action schema', 'validation', 'apply'],
        out_of_scope: ['worker handoff'],
        done_when: ['不再存在 attrs 中间层'],
        context_refs: ['docs/design/workflow/action.md'],
        instructions: ['只改 manager 编排层'],
      },
    },
    {
      type: 'set_plan',
      plan_id: null,
      plan: {
        title: '空闲时继续收敛协议',
        trigger: { type: 'on_worker_slot_freed' },
        task: {
          title: '继续收敛 actions v2',
          cwd: '/tmp/mimikit',
          mode: 'read',
          use_worktree: false,
          goal: '继续评审和收敛协议',
          in_scope: ['manager action 设计'],
          out_of_scope: [],
          done_when: ['输出下一轮结论'],
          context_refs: [],
          instructions: [],
        },
        priority: 'normal',
        max_runs: 5,
      },
    },
  ])
})

test('parseManagerTurn rejects legacy top-level fields', () => {
  expect(() =>
    parseManagerTurn({
      version: 'manager-turn/v1',
      reply_text: 'legacy',
      actions: [],
    }),
  ).toThrow()
})
