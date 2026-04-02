import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import {
  createIntentEvidenceTask,
  createIntentEvidenceUserInput as createUserInput,
} from './helpers/manager-intent-evidence.js'

test('enqueue_task falls back to direct user intent when explicit continuation_of is stale', () => {
  const finishedTask = createIntentEvidenceTask({
    id: 'task-finished-auth-guard-stale-anchor',
    title: '收敛 auth guard 的主链',
    cwd: '/repo/auth-guard',
    focusId: 'focus-inbox',
    status: 'succeeded',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'enqueue_task',
        continuation_of: {
          type: 'task',
          id: finishedTask.id,
        },
        task: {
          title: '继续收敛 auth guard 的下一步主链',
          cwd: '/repo/auth-guard',
          mode: 'write',
          goal: '继续收敛 auth guard 的下一步主链并落地代码修改',
          in_scope: ['延续 auth guard 主链'],
          out_of_scope: [],
          done_when: ['下一步主线修改完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    {
      inputs: [
        createUserInput('继续收敛 auth guard 的下一步主链并落地代码修改。'),
      ],
      taskById: new Map([[finishedTask.id, finishedTask]]),
      taskStatusById: new Map([[finishedTask.id, finishedTask.status]]),
      planById: new Map(),
      planStatusById: new Map(),
      resultTaskIds: new Set(['task-other-result']),
      supplementalEvidenceSources: new Set(['task_result']),
      defaultFocusId: 'focus-inbox',
    },
  )

  expect(feedback).toHaveLength(0)
})
