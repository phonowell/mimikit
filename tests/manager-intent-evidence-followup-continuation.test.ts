import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'
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
