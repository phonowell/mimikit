import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup rejects advisory-only result follow-up when the active plan is explicitly anchored to the finished task even without contract text overlap', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-plan-anchor-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-plan-anchor',
          title: '实现 auth guard 下一步落地修改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
        }),
      ],
      taskPlans: [
        {
          id: 'plan-followup-anchor',
          title: '按整体方案推进 auth guard 主线',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor',
            taskContract: {
              goal: '按整体方案推进 auth guard 主线',
              scope: '只处理 auth guard 主线',
              acceptance: ['当前主线继续推进'],
            },
            taskTemplate: {
              title: '按整体方案推进 auth guard 主线',
              executionSpecId: 'spec-followup-anchor',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
            lastTaskId: 'task-finished-plan-anchor',
          },
        },
      ],
    },
  })

  const followup = await resolveRoundFollowup({
    runtime,
    inputs: [],
    results: [
      {
        taskId: 'task-finished-plan-anchor',
        status: 'succeeded',
        ok: true,
        output: '已完成当前子步，继续推进下一批整改。',
        durationMs: 12,
        completedAt: '2026-04-02T00:05:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: '当前子步已完成。',
        },
      },
    ],
    parsed: [],
    output: '建议下一步继续推进同一目标，但我先停在这里。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-plan-anchor']),
    wakeProfile: 'task_result',
  })

  expect(followup.done).toBe(false)
  if (followup.done) return
  expect(followup.extra.actionFeedback?.[0]).toMatchObject({
    action: 'manager_followup',
    code: 'missing_result_followup_action',
  })
})
