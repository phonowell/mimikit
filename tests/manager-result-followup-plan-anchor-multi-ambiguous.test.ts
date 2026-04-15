import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

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
