import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup keeps asking for an explicit follow-up when the only structurally anchored plan is semantically unrelated', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-plan-anchor-multi-unrelated-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-plan-anchor-multi-unrelated',
          title: '实现 auth guard 下一步落地修改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
        }),
      ],
      taskPlans: [
        {
          id: 'plan-followup-anchor-unrelated-target',
          title: '重构 billing retry 主线',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-unrelated-target',
            taskContract: {
              goal: '重构 billing retry 主线并完成回归验证',
              scope: '只处理 billing retry pipeline',
              acceptance: ['billing retry 主链完成'],
            },
            taskTemplate: {
              title: '重构 billing retry 主线',
              executionSpecId: 'spec-followup-anchor-unrelated-target',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
            lastTaskId: 'task-finished-plan-anchor-multi-unrelated',
          },
        },
        {
          id: 'plan-followup-anchor-unrelated-other',
          title: '并行的另一个 active plan',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-unrelated-other',
            taskContract: {
              goal: '处理另一条主线',
              scope: '只处理另一条主线',
              acceptance: ['另一条主线继续推进'],
            },
            taskTemplate: {
              title: '另一条主线任务',
              executionSpecId: 'spec-followup-anchor-unrelated-other',
              cwd: '/repo/other',
              resourceMode: 'write',
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
            lastTaskId: 'task-other',
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
        taskId: 'task-finished-plan-anchor-multi-unrelated',
        status: 'succeeded',
        ok: true,
        output: 'auth guard 子步已完成。',
        durationMs: 12,
        completedAt: '2026-04-02T00:05:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: 'auth guard 当前子步已完成。',
          nextSteps: ['继续 auth guard 主线下一步整改。'],
        },
      },
    ],
    parsed: [],
    output: '建议下一步继续推进同一目标，但我先停在这里。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-plan-anchor-multi-unrelated']),
    wakeProfile: 'task_result',
  })

  expect(followup).toMatchObject({
    done: false,
    extra: {
      actionFeedback: [
        expect.objectContaining({
          action: 'manager_followup',
          code: 'missing_result_followup_action',
        }),
      ],
    },
  })
})
