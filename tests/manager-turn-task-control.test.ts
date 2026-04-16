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

test('parseManagerTurn rejects task_control non-resume actions with instructions', () => {
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
  expect(() =>
    parseManagerTurn({
      reply: '收到。',
      actions: [
        {
          type: 'task_control',
          task_id: 'task-pause-target',
          action: 'pause',
          instructions: ['wait for user reply'],
        },
      ],
    }),
  ).toThrow(/instructions/i)
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
