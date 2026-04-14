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

test('resolveRoundFollowup asks for lightweight confirmation when task_result follow-up still points to competing active worklines', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-plan-anchor-multi-ambiguous-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-plan-anchor-multi-ambiguous',
          title: '推进 auth guard 当前整改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
          contract: {
            goal: '沿当前鉴权链路继续推进这一批整改',
            scope: '只处理 auth guard 主线',
            acceptance: ['这一批整改完成'],
          },
        }),
      ],
      taskPlans: [
        {
          id: 'plan-followup-anchor-ambiguous-a',
          title: '继续推进 auth guard 后续整改',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-ambiguous-a',
            taskContract: {
              goal: '沿当前鉴权链路继续推进 auth guard 后续整改',
              scope: '只处理 auth guard 主线',
              acceptance: ['后续整改完成'],
            },
            taskTemplate: {
              title: '继续推进 auth guard 后续整改',
              executionSpecId: 'spec-followup-anchor-ambiguous-a',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
            lastTaskId: 'task-finished-plan-anchor-multi-ambiguous',
          },
        },
        {
          id: 'plan-followup-anchor-ambiguous-b',
          title: '继续推进 auth guard 剩余整改',
          focusId: 'focus-inbox',
          priority: 'normal',
          status: 'active',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-anchor-ambiguous-b',
            taskContract: {
              goal: '沿当前鉴权链路继续推进 auth guard 剩余整改',
              scope: '只处理 auth guard 主线',
              acceptance: ['剩余整改完成'],
            },
            taskTemplate: {
              title: '继续推进 auth guard 剩余整改',
              executionSpecId: 'spec-followup-anchor-ambiguous-b',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
          createdAt: '2026-04-02T00:04:00.000Z',
          updatedAt: '2026-04-02T00:04:00.000Z',
          runtime: {
            runCount: 1,
            lastTaskId: 'task-finished-plan-anchor-multi-ambiguous',
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
        taskId: 'task-finished-plan-anchor-multi-ambiguous',
        status: 'succeeded',
        ok: true,
        output: '当前 auth guard 子步已完成。',
        durationMs: 12,
        completedAt: '2026-04-02T00:05:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: '当前 auth guard 子步已完成。',
          nextSteps: ['继续 auth guard 主线下一步整改。'],
        },
      },
    ],
    parsed: [
      {
        type: 'enqueue_task',
        task: {
          title: '继续推进 auth guard 当前整改',
          cwd: '/repo/mimikit',
          mode: 'write',
          use_worktree: false,
          goal: '沿当前鉴权链路继续推进这一批整改',
          in_scope: ['只处理 auth guard 主线'],
          out_of_scope: [],
          done_when: ['这一批整改完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    output: '继续沿同一目标推进下一步整改。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-plan-anchor-multi-ambiguous']),
    wakeProfile: 'task_result',
  })

  expect(followup.done).toBe(false)
  if (followup.done) throw new Error('expected confirmation follow-up')
  expect(followup.extra.actionFeedback).toHaveLength(1)
  expect(followup.extra.actionFeedback?.[0]).toMatchObject({
    action: 'enqueue_task',
    error: 'action_execution_rejected',
    code: 'intent_evidence_missing',
  })
  expect(followup.extra.actionFeedback?.[0]?.hint).toContain('哪一条工作线')
})
