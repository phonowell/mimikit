import { expect, test } from 'vitest'

import { collectManagerActionFeedback } from '../src/policy/manager/action-feedback-collect.js'

import { createIntentEvidenceTask } from './helpers/manager-intent-evidence.js'

test('task_control invalid instructions hint includes task_id when task is known', () => {
  const task = createIntentEvidenceTask({
    id: 'task-123',
    title: '按整体方案继续推进下一项未完成整改',
    status: 'running',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'cancel',
        instructions: ['stop this task'],
      },
    ],
    {
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('task_control')
  expect(feedback[0]?.hint).toContain(task.id)
})

test('task_control status rejection hint includes task title and task_id when task is known', () => {
  const task = createIntentEvidenceTask({
    id: 'task-456',
    title: '盘点并闭环散落的 wt/分支，合并回 main 后清理',
    status: 'paused',
  })

  const feedback = collectManagerActionFeedback(
    [
      {
        type: 'task_control',
        task_id: task.id,
        action: 'pause',
      },
    ],
    {
      taskStatusById: new Map([[task.id, task.status]]),
      taskById: new Map([[task.id, task]]),
    },
  )

  expect(feedback).toHaveLength(1)
  expect(feedback[0]?.action).toBe('task_control')
  expect(feedback[0]?.hint).toContain(task.id)
  expect(feedback[0]?.hint).toContain(task.title)
})
