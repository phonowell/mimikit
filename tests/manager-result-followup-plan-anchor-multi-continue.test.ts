import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup keeps low-risk write continuation on task_result when one anchored active plan is the most likely workline', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-plan-anchor-multi-continue-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-plan-anchor-multi-continue',
          title: '补齐 auth guard 入口门禁收尾',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
          contract: {
            goal: '沿当前鉴权链路补齐入口门禁剩余改造',
            scope: '只处理 auth guard 主线',
            acceptance: ['入口门禁剩余改造完成'],
          },
        }),
      ],
      taskPlans: [
        {
          id: 'plan-followup-anchor-continue-target',
          title: '按整体方案推进 auth guard 主线',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-continue-target',
            taskContract: {
              goal: '沿当前鉴权链路补齐入口门禁剩余改造',
              scope: '只处理 auth guard 主线',
              acceptance: ['入口门禁剩余改造完成'],
            },
            taskTemplate: {
              title: '推进 auth guard 主线收尾',
              executionSpecId: 'spec-followup-anchor-continue-target',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
            lastTaskId: 'task-finished-plan-anchor-multi-continue',
          },
        },
        {
          id: 'plan-followup-anchor-continue-other',
          title: '重构 billing retry 主线',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-continue-other',
            taskContract: {
              goal: '重构 billing retry 主线并完成回归验证',
              scope: '只处理 billing retry pipeline',
              acceptance: ['billing retry 主链完成'],
            },
            taskTemplate: {
              title: '重构 billing retry 主线',
              executionSpecId: 'spec-followup-anchor-continue-other',
              cwd: '/repo/mimikit',
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
        taskId: 'task-finished-plan-anchor-multi-continue',
        status: 'succeeded',
        ok: true,
        output: '当前 auth guard 子步已完成，继续收尾剩余入口门禁改造。',
        durationMs: 12,
        completedAt: '2026-04-02T00:05:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: '当前 auth guard 子步已完成。',
          nextSteps: ['继续补齐入口门禁剩余改造。'],
        },
      },
    ],
    parsed: [
      {
        type: 'enqueue_task',
        task: {
          title: '补齐入口门禁剩余改造',
          cwd: '/repo/mimikit',
          mode: 'write',
          use_worktree: false,
          goal: '沿当前鉴权链路继续补实现并完成验收',
          in_scope: ['聚焦登录门禁后续落地'],
          out_of_scope: [],
          done_when: ['当前入口门禁主线收尾完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    output: '继续沿同一目标推进下一步收尾。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-plan-anchor-multi-continue']),
    wakeProfile: 'task_result',
  })

  expect(followup).toMatchObject({
    done: true,
  })
})
