import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
} from './helpers/manager-intent-evidence.js'

test('enqueue_task(read) continuation stays allowed when historical contract is verbose but next draft is compacted', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-output-budget',
    title: '收敛 output tokens 主链',
    cwd: '/repo/mimikit',
    focusId: 'focus-inbox',
    status: 'succeeded',
    contract: {
      goal: '收敛 output tokens 主链并给出下一步最小实现方向',
      scope: [
        '只处理 manager 侧结构化 action 输出',
        '保持 worker 真合同与 archive 不变',
        '避免把 verbose contract 继续回灌给 manager',
      ].join('；'),
      acceptance: [
        '确认主放大点',
        '确认最小实现顺序',
        '确认不削弱 continuation 与审计',
      ],
      outOfScope: '不扩展任务类型；不放宽高风险门禁',
    },
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        task: {
          title: '继续收敛 output tokens 主链',
          cwd: '/repo/mimikit',
          mode: 'read',
          use_worktree: false,
          goal: '继续收敛 output tokens 主链并落地最小实现',
          in_scope: [
            '只处理 manager 侧结构化 action 输出',
            '保持 worker 真合同与 archive 不变',
          ],
          out_of_scope: ['不扩展任务类型'],
          done_when: ['最小实现顺序已落地', 'continuation 与审计未受损'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [createUserInput('继续把 output tokens 这条线推进下去。')],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      resultTaskIds: new Set([finishedTask.id]),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})
