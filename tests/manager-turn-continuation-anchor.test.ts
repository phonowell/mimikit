import { expect, test } from 'vitest'

import { parseManagerTurn } from '../src/policy/manager/manager-turn.js'

test('parseManagerTurn rejects removed continuation_of anchors on enqueue_task and set_plan', () => {
  expect(() =>
    parseManagerTurn({
      reply: '继续推进。',
      actions: [
        {
          type: 'enqueue_task',
          continuation_of: {
            type: 'plan',
            id: 'plan-current-anchor',
          },
          task: {
            title: '继续推进当前主线',
            cwd: '/tmp/mimikit',
            mode: 'write',
            goal: '继续推进当前主线并落地修改',
            in_scope: ['主线续跑'],
            out_of_scope: [],
            done_when: ['下一步主线完成'],
            context_refs: [],
            instructions: [],
          },
        },
        {
          type: 'set_plan',
          plan_id: null,
          continuation_of: {
            type: 'task',
            id: 'task-current-anchor',
          },
          plan: {
            title: '空闲时继续推进当前主线',
            trigger: { type: 'on_worker_slot_freed' },
            task: {
              title: '继续推进当前主线',
              cwd: '/tmp/mimikit',
              mode: 'write',
              goal: '继续推进当前主线并落地修改',
              in_scope: ['主线续跑'],
              out_of_scope: [],
              done_when: ['下一步主线完成'],
              context_refs: [],
              instructions: [],
            },
            priority: 'normal',
            max_runs: 1,
          },
        },
      ],
    }),
  ).toThrow()
})
