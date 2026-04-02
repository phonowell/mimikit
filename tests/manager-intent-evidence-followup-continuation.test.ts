import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import {
  createPlanFixture,
  createTaskFixture,
} from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup keeps enqueue_task continuation when a single current plan anchors the next step', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-continuation-test',
    withGlobalFocus: false,
    patch: {
      taskPlans: [
        createPlanFixture({
          id: 'plan-followup-continuation',
          title: '按整体方案粗粒度推进后续整改',
          focusId: 'focus-inbox',
          status: 'active',
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-continuation',
            taskContract: {
              goal: '以粗粒度方式推进下一批未完成整改',
              scope: '优先按阶段推进更大闭环',
              acceptance: ['本轮粗粒度专题已完成'],
            },
            taskTemplate: {
              title: '按整体方案粗粒度推进下一批未完成整改',
              executionSpecId: 'spec-followup-continuation',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
        }),
      ],
    },
  })

  const followup = await resolveRoundFollowup({
    runtime,
    inputs: [createUserInput('继续推进这一条线。')],
    parsed: [
      {
        type: 'enqueue_task',
        task: {
          title: '按整体方案粗粒度推进下一批未完成整改',
          cwd: '/repo/mimikit',
          mode: 'write',
          goal: '以粗粒度方式推进下一批未完成整改',
          in_scope: ['优先按阶段推进更大闭环'],
          out_of_scope: [],
          done_when: ['本轮粗粒度专题已完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    output: '我会继续推进当前这条线。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished']),
    wakeProfile: 'mixed',
  })

  expect(followup.done).toBe(true)
})

test('resolveRoundFollowup allows advisory-only result follow-up when a single current plan already provides runtime-managed continuation', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-requires-action-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-followup',
          title: '按整体方案推进当前整改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
          contract: {
            goal: '以粗粒度方式推进当前整改',
            scope: '优先按阶段推进更大闭环',
            acceptance: ['本轮粗粒度专题已完成'],
          },
        }),
      ],
      taskPlans: [
        createPlanFixture({
          id: 'plan-followup-required',
          title: '按整体方案粗粒度推进后续整改',
          focusId: 'focus-inbox',
          status: 'active',
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-followup-required',
            taskContract: {
              goal: '以粗粒度方式推进当前整改',
              scope: '优先按阶段推进更大闭环',
              acceptance: ['本轮粗粒度专题已完成'],
            },
            taskTemplate: {
              title: '按整体方案推进当前整改',
              executionSpecId: 'spec-followup-required',
              cwd: '/repo/mimikit',
              resourceMode: 'write',
            },
          },
        }),
      ],
    },
  })

  const followup = await resolveRoundFollowup({
    runtime,
    inputs: [],
    results: [
      {
        taskId: 'task-finished-followup',
        status: 'succeeded',
        ok: true,
        output: '已完成当前子步，建议按同一计划继续。',
        durationMs: 12,
        completedAt: '2026-04-02T00:00:00.000Z',
        stopReason: 'completed',
      },
    ],
    parsed: [],
    output: '建议下一步继续按当前计划推进，但我先停在这里。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-followup']),
    wakeProfile: 'task_result',
  })

  expect(followup).toMatchObject({
    done: true,
  })
})
