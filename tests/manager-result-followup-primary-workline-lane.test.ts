import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createIntentEvidenceUserInput as createUserInput } from './helpers/manager-intent-evidence.js'
import { createPlanFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup enforces write-lane evidence against the batch primary workline', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-primary-workline-lane-test',
    patch: {
      focuses: [
        {
          id: 'focus-global',
          title: 'Global',
          status: 'active',
          createdAt: '2026-04-15T00:00:00.000Z',
          updatedAt: '2026-04-15T00:00:00.000Z',
          lastActivityAt: '2026-04-15T00:00:00.000Z',
        },
        {
          id: 'focus-auth-guard',
          title: 'Auth Guard',
          status: 'active',
          createdAt: '2026-04-15T00:00:00.000Z',
          updatedAt: '2026-04-15T00:00:01.000Z',
          lastActivityAt: '2026-04-15T00:00:01.000Z',
        },
      ],
      taskPlans: [
        createPlanFixture({
          id: 'plan-auth-guard-primary-lane',
          title: '继续推进 auth guard 主线',
          focusId: 'focus-auth-guard',
          status: 'active',
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-auth-guard-primary-lane',
            taskContract: {
              goal: '沿当前鉴权链路继续推进 auth guard 主线',
              scope: '只处理 auth guard 主线',
              acceptance: ['auth guard 主线完成'],
            },
            taskTemplate: {
              title: '继续推进 auth guard 主线',
              executionSpecId: 'spec-auth-guard-primary-lane',
              cwd: '/repo/auth-guard',
              resourceMode: 'write',
              useWorktree: false,
            },
          },
        }),
      ],
    },
  })

  const followup = await resolveRoundFollowup({
    runtime,
    defaultFocusId: 'focus-auth-guard',
    inputs: [createUserInput('继续推进 auth guard 主线，把这一条线收掉。')],
    parsed: [
      {
        type: 'enqueue_task',
        task: {
          title: '继续推进 auth guard 主线',
          cwd: '/repo/auth-guard-next',
          mode: 'write',
          use_worktree: true,
          goal: '沿当前鉴权链路继续推进 auth guard 主线',
          in_scope: ['只处理 auth guard 主线'],
          out_of_scope: [],
          done_when: ['auth guard 主线完成'],
          context_refs: [],
          instructions: [],
        },
      },
    ],
    output: '继续推进当前主线。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(),
    wakeProfile: 'user_input',
  })

  expect(followup.done).toBe(false)
  if (followup.done) throw new Error('expected follow-up feedback')
  expect(followup.extra.actionFeedback).toHaveLength(1)
  expect(followup.extra.actionFeedback?.[0]).toMatchObject({
    action: 'enqueue_task',
    error: 'action_execution_rejected',
    code: 'intent_evidence_missing',
  })
})
