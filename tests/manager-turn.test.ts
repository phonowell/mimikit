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

test('parseManagerTurn keeps structured remember_project_profile action as-is', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'remember_project_profile',
        content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
        source_input_id: 'input-user',
        source_quote: '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
      },
    ],
  })

  expect(parsed.actions).toEqual([
    {
      type: 'remember_project_profile',
      content: '本仓库命令面统一使用 pnpm + tsx，不再补 npm 兼容脚本。',
      source_input_id: 'input-user',
      source_quote: '后续统一用 pnpm + tsx 命令，不再补 npm 兼容脚本',
    },
  ])
})

test('parseManagerTurn rejects removed record_task_git action', () => {
  expect(() =>
    parseManagerTurn({
      reply: '收到。',
      actions: [
        {
          type: 'record_task_git',
          task_id: 'task-auth-guard',
          state: 'merged',
          source_input_id: 'input-user',
          source_quote: '已合并到 main',
        },
      ],
    }),
  ).toThrow()
})

test('parseManagerTurn accepts task_control cancel without instructions', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'task_control',
        task_id: 'task-cancel-target',
        action: 'cancel',
      },
    ],
  })

  expect(parsed.actions).toEqual([
    {
      type: 'task_control',
      task_id: 'task-cancel-target',
      action: 'cancel',
    },
  ])
})

test('parseManagerTurn rejects task_control cancel with instructions', () => {
  expect(() =>
    parseManagerTurn({
      reply: '收到。',
      actions: [
        {
          type: 'task_control',
          task_id: 'task-cancel-target',
          action: 'cancel',
          instructions: ['stop this task'],
        },
      ],
    }),
  ).toThrow(/instructions/i)
})
