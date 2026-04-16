import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

const repeatClause = (label: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${label}-${index + 1}`)

test('parseManagerTurn rejects oversized enqueue_task drafts instead of compacting them', () => {
  expect(() =>
    parseManagerTurn({
      reply: '收到。',
      actions: [
        {
          type: 'enqueue_task',
          task: {
            title: '综合多源证据并设计 output tokens 优化方案',
            cwd: '/tmp/mimikit',
            mode: 'read',
            goal: 'g'.repeat(241),
            in_scope: [
              '回读 manager 当前输出链路并定位主要放大点。',
              '回读历史任务归档中已提出的 output tokens 方向并核对适用性。',
              '阅读外部参考实现以提炼可复用模式。',
              '比较多种候选方案的收益、风险与复杂度。',
              '给出最终推荐顺序与落地边界。',
            ],
            out_of_scope: [
              '直接修改 provider 内部记账逻辑。',
              '改造成全面成本治理平台。',
              '扩展无边界的浏览器验证链路。',
              '放松高风险门禁与审计要求。',
            ],
            done_when: [
              '明确首选方案与推荐顺序。',
              '明确短期止血项与中期方案。',
              '区分已证实与保守推断。',
              '说明是否符合项目目标与是否过度设计。',
              '给出 manager 可直接继续编排的结论。',
            ],
            context_refs: [
              'tasks/2026-04-01/task-a.md',
              'tasks/2026-04-01/task-b.md',
              'tasks/2026-04-01/task-c.md',
              'tasks/2026-04-01/task-d.md',
              'tasks/2026-04-01/task-e.md',
            ],
            instructions: [
              '优先高 ROI、低复杂度、不中断现有门禁与审计的方案。',
              '把证据来源分成实现、参考、技能、外网四类。',
              '证据不足处直接标缺口，不要补猜。',
            ],
          },
        },
      ],
    }),
  ).toThrow()
})

test('parseManagerTurn rejects over-limit enqueue_task list counts instead of trimming them', () => {
  expect(() =>
    parseManagerTurn({
      reply: '收到。',
      actions: [
        {
          type: 'enqueue_task',
          task: {
            title: '继续收敛 enqueue_task 合同',
            cwd: '/tmp/mimikit',
            mode: 'read',
            use_worktree: false,
            goal: '收敛 parse 层前置失败，禁止 verbose draft 先进入 repair。',
            in_scope: repeatClause('scope', 6),
            out_of_scope: repeatClause('out', 3),
            done_when: repeatClause('done', 6),
            context_refs: repeatClause('tasks/ref', 6),
            instructions: repeatClause('instruction', 4),
          },
        },
      ],
    }),
  ).toThrow()
})

test('parseManagerTurn rejects clause-heavy set_plan task fields instead of compacting them', () => {
  expect(() =>
    parseManagerTurn({
      reply: '收到。',
      actions: [
        {
          type: 'set_plan',
          plan_id: null,
          plan: {
            title: 'Compact plan task draft',
            trigger: { type: 'on_worker_slot_freed' },
            priority: 'normal',
            max_runs: 1,
            task: {
              title: '继续压缩 manager 合同回灌',
              cwd: '/tmp/mimikit',
              mode: 'read',
              use_worktree: false,
              goal: [
                '第一段目标说明'.repeat(20),
                '第二段目标说明'.repeat(20),
                '第三段目标说明'.repeat(20),
              ].join('；'),
              in_scope: [`${'范围一'.repeat(40)}；${'范围二'.repeat(40)}`],
              out_of_scope: [],
              done_when: ['完成一'.repeat(12), '完成二'.repeat(12)],
              context_refs: [],
              instructions: [`${'补充一'.repeat(24)}；${'补充二'.repeat(24)}`],
            },
          },
        },
      ],
    }),
  ).toThrow()
})
