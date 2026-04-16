import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

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

test('parseManagerTurn strips task_control instructions for non-resume actions', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'task_control',
        task_id: 'task-cancel-target',
        action: 'cancel',
        instructions: ['stop this task'],
      },
      {
        type: 'task_control',
        task_id: 'task-pause-target',
        action: 'pause',
        instructions: ['wait for user reply'],
      },
    ],
  })

  expect(parsed.actions).toEqual([
    {
      type: 'task_control',
      task_id: 'task-cancel-target',
      action: 'cancel',
    },
    {
      type: 'task_control',
      task_id: 'task-pause-target',
      action: 'pause',
    },
  ])
})

test('parseManagerTurn keeps task_control resume instructions', () => {
  const parsed = parseManagerTurn({
    reply: '收到。',
    actions: [
      {
        type: 'task_control',
        task_id: 'task-resume-target',
        action: 'resume',
        instructions: ['continue from the review comments'],
      },
    ],
  })

  expect(parsed.actions).toEqual([
    {
      type: 'task_control',
      task_id: 'task-resume-target',
      action: 'resume',
      instructions: ['continue from the review comments'],
    },
  ])
})
