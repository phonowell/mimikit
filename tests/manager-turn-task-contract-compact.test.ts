import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

const draftTotalChars = (task: {
  title: string
  goal: string
  in_scope: string[]
  out_of_scope: string[]
  done_when: string[]
  context_refs: string[]
  instructions: string[]
}): number =>
  [
    task.title,
    task.goal,
    ...task.in_scope,
    ...task.out_of_scope,
    ...task.done_when,
    ...task.context_refs,
    ...task.instructions,
  ].reduce((sum, item) => sum + item.length, 0)

test('parseManagerTurn canonicalizes oversized enqueue_task drafts into compact contracts', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'enqueue_task',
        task: {
          title: '综合多源证据并设计 output tokens 优化方案',
          cwd: '/tmp/mimikit',
          mode: 'read',
          goal: '结合当前运行态、历史归档、外部参考与用户目标，给出一套稳妥有效且不明显削弱能力的 output tokens 优化方案。',
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
  })

  expect(parsed.actions[0]).toMatchObject({
    type: 'enqueue_task',
    task: {
      in_scope: [
        '回读 manager 当前输出链路并定位主要放大点。',
        '回读历史任务归档中已提出的 output tokens 方向并核对适用性。',
        '阅读外部参考实现以提炼可复用模式。',
      ],
      done_when: [
        '明确首选方案与推荐顺序。',
        '明确短期止血项与中期方案。',
        '区分已证实与保守推断。',
      ],
      out_of_scope: [
        '直接修改 provider 内部记账逻辑。',
        '改造成全面成本治理平台。',
      ],
      context_refs: [
        'tasks/2026-04-01/task-a.md',
        'tasks/2026-04-01/task-b.md',
        'tasks/2026-04-01/task-c.md',
      ],
      instructions: [
        '优先高 ROI、低复杂度、不中断现有门禁与审计的方案。',
        '把证据来源分成实现、参考、技能、外网四类。',
      ],
    },
  })
  if (parsed.actions[0]?.type !== 'enqueue_task')
    throw new Error('expected task')
  expect(draftTotalChars(parsed.actions[0].task)).toBeLessThanOrEqual(900)
})
