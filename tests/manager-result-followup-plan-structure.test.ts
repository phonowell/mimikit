import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup allows advisory-only result follow-up when the only active plan changes worktree semantics', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-plan-structure-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-plan-structure',
          title: '实现 auth guard 下一步落地修改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
          git: {
            worktreePath: '/repo/.worktrees/auth-guard',
            branch: 'fix/auth-guard',
            closureRequired: true,
          },
        }),
      ],
      taskPlans: [
        {
          id: 'plan-followup-structure-mismatch',
          title: '按整体方案推进 auth guard 主线',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-structure-mismatch',
            taskContract: {
              goal: '按整体方案推进 auth guard 主线',
              scope: '只处理 auth guard 主线',
              acceptance: ['当前主线继续推进'],
            },
            taskTemplate: {
              title: '按整体方案推进 auth guard 主线',
              executionSpecId: 'spec-followup-structure-mismatch',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
              useWorktree: false,
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
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
        taskId: 'task-finished-plan-structure',
        status: 'succeeded',
        ok: true,
        output: '已完成当前子步。',
        durationMs: 12,
        completedAt: '2026-04-02T00:05:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: '当前子步已完成。',
          nextSteps: ['继续推进同一目标的下一步闭环'],
        },
      },
    ],
    parsed: [],
    output: '建议下一步继续推进同一目标，但我先停在这里。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-plan-structure']),
    wakeProfile: 'task_result',
  })

  expect(followup.done).toBe(true)
})
