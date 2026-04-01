import { expect, test } from 'vitest'

import {
  buildPlansPromptPayload,
  buildTasksPromptPayload,
} from '../src/foundation/prompting/format.js'

import {
  createPlanFixture,
  createTaskFixture,
} from './helpers/runtime-snapshot.js'

test('buildTasksPromptPayload compacts verbose task contracts before injecting them back to manager', () => {
  const task = createTaskFixture({
    id: 'task-verbose-contract-1',
    title: 'Verbose contract task',
  })
  task.contract = {
    goal: '保持主线程只看到最小合同摘要，同时不要削弱 worker 真实执行能力。',
    scope: [
      '回读当前 manager prompt 中的任务合同注入点',
      '压缩历史任务合同在 state packet 中的暴露形式',
      '保持 continuation 与 intent-evidence 所需信号',
      '不要把 archive 正文重新塞回 manager prompt',
    ].join('；'),
    acceptance: [
      'state packet 中不再出现完整 verbose contract',
      'manager 仍可识别任务目标与边界',
      'continuation 不因合同压缩而误伤',
    ],
    outOfScope: [
      '放宽任务合同 budget 限额',
      '扩展新的任务类型协议',
      '修改 worker 的最终归档要求',
    ].join('；'),
    contextRefs: [
      'tasks/2026-04-01/task-a.md',
      'tasks/2026-04-01/task-b.md',
      'tasks/2026-04-01/task-c.md',
      'tasks/2026-04-01/task-d.md',
    ],
  }

  const payload = buildTasksPromptPayload([task], [], '/tmp')

  expect(payload?.tasks[0]).toMatchObject({
    id: 'task-verbose-contract-1',
    contract: {
      goal: '保持主线程只看到最小合同摘要，同时不要削弱 worker 真实执行能力。',
      scope:
        '回读当前 manager prompt 中的任务合同注入点；压缩历史任务合同在 state packet 中的暴露形式',
      acceptance: [
        'state packet 中不再出现完整 verbose contract',
        'manager 仍可识别任务目标与边界',
      ],
      out_of_scope: '放宽任务合同 budget 限额；扩展新的任务类型协议',
      context_refs: [
        'tasks/2026-04-01/task-a.md',
        'tasks/2026-04-01/task-b.md',
      ],
    },
  })
})

test('buildPlansPromptPayload compacts verbose plan task contracts for manager consumption', () => {
  const plan = createPlanFixture({
    id: 'plan-verbose-contract-1',
    effect: {
      kind: 'enqueue_task',
      taskContract: {
        goal: '收敛计划触发时注入给 manager 的合同摘要，避免继续示范 verbose contract。',
        scope: [
          '只保留 manager 编排所需的最小 goal/scope digest',
          '不要把完整 acceptance 和 context refs 全量塞回 state packet',
          '保持后续 continuation 判定可用',
        ].join('；'),
        acceptance: [
          '计划仍可展示最小目标',
          '计划仍可展示最小验收摘要',
          '计划不会回灌完整 verbose 合同',
        ],
        outOfScope: '修改 worker 执行协议；扩展新的 plan effect 类型',
        contextRefs: [
          'plans/verbose-a.md',
          'plans/verbose-b.md',
          'plans/verbose-c.md',
        ],
      },
      taskKey: 'task-key-verbose-contract-1',
      taskTemplate: {
        title: 'Compact verbose plan contract',
        executionSpecId: 'spec-plan-verbose-contract-1',
        cwd: '/tmp/runtime-snapshot-plan-task',
        resourceMode: 'write',
      },
    },
  })

  const payload = buildPlansPromptPayload([plan])

  expect(payload?.plans[0]).toMatchObject({
    id: 'plan-verbose-contract-1',
    task_contract: {
      goal: '收敛计划触发时注入给 manager 的合同摘要，避免继续示范 verbose contract。',
      scope:
        '只保留 manager 编排所需的最小 goal/scope digest；不要把完整 acceptance 和 context refs 全量塞回 state packet',
      acceptance: ['计划仍可展示最小目标', '计划仍可展示最小验收摘要'],
      out_of_scope: '修改 worker 执行协议；扩展新的 plan effect 类型',
      context_refs: ['plans/verbose-a.md', 'plans/verbose-b.md'],
    },
  })
})
