import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup allows advisory-only follow-up when multiple active plans exist but exactly one is structurally anchored to the finished task', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-plan-anchor-multi-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-plan-anchor-multi',
          title: '实现 auth guard 下一步落地修改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
        }),
      ],
      taskPlans: [
        {
          id: 'plan-followup-anchor-target',
          title: '按整体方案推进 auth guard 主线',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-target',
            taskContract: {
              goal: '按整体方案推进 auth guard 主线',
              scope: '只处理 auth guard 主线',
              acceptance: ['当前主线继续推进'],
            },
            taskTemplate: {
              title: '按整体方案推进 auth guard 主线',
              executionSpecId: 'spec-followup-anchor-target',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
            lastTaskId: 'task-finished-plan-anchor-multi',
          },
        },
        {
          id: 'plan-followup-anchor-other',
          title: '并行的另一个 active plan',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-other',
            taskContract: {
              goal: '处理另一条主线',
              scope: '只处理另一条主线',
              acceptance: ['另一条主线继续推进'],
            },
            taskTemplate: {
              title: '另一条主线任务',
              executionSpecId: 'spec-followup-anchor-other',
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
        taskId: 'task-finished-plan-anchor-multi',
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
    resultTaskIds: new Set(['task-finished-plan-anchor-multi']),
    wakeProfile: 'task_result',
  })

  expect(followup).toMatchObject({
    done: true,
  })
})
