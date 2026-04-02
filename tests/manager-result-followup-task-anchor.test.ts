import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup rejects advisory-only result follow-up when the result task itself carries a single clear next step', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-task-anchor-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-task-anchor',
          title: '按整体方案推进当前整改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
        }),
      ],
      taskPlans: [],
    },
  })

  const followup = await resolveRoundFollowup({
    runtime,
    inputs: [],
    results: [
      {
        taskId: 'task-finished-task-anchor',
        status: 'succeeded',
        ok: true,
        output: '已完成当前子步，继续推进下一批整改。',
        durationMs: 12,
        completedAt: '2026-04-02T00:05:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: '当前子步已完成。',
          nextSteps: ['继续推进同一整改目标的下一批闭环'],
        },
      },
    ],
    parsed: [],
    output: '建议下一步继续推进同一目标，但我先停在这里。',
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-task-anchor']),
    wakeProfile: 'task_result',
  })

  expect(followup.done).toBe(false)
  if (followup.done) return
  expect(followup.extra.actionFeedback).toHaveLength(1)
  expect(followup.extra.actionFeedback?.[0]).toMatchObject({
    action: 'manager_followup',
    error: 'action_execution_rejected',
    code: 'missing_result_followup_action',
  })
  expect(followup.extra.actionFeedback?.[0]?.hint).toContain('task_result')
  expect(followup.extra.actionFeedback?.[0]?.hint).toContain('具体 action')
  expect(followup.extra.actionFeedback?.[0]?.hint).toContain('decision')
})

test('resolveRoundFollowup allows explicit escalation decision without actions when task_result-only follow-up must stop', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-task-anchor-escalate-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-task-anchor-escalate',
          title: '按整体方案推进当前整改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
        }),
      ],
      taskPlans: [],
    },
  })

  const followup = await resolveRoundFollowup({
    runtime,
    inputs: [],
    results: [
      {
        taskId: 'task-finished-task-anchor-escalate',
        status: 'succeeded',
        ok: true,
        output: '已完成当前子步，但证据冲突，需要你拍板。',
        durationMs: 12,
        completedAt: '2026-04-02T00:06:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: '当前子步已完成。',
          nextSteps: ['继续推进同一整改目标的下一批闭环'],
          risks: ['当前证据存在冲突，需要用户拍板。'],
        },
      },
    ],
    parsed: [],
    output: '当前证据冲突，需要你拍板。',
    decision: {
      mode: 'escalate',
      reason: 'evidence_conflict',
    },
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-task-anchor-escalate']),
    wakeProfile: 'task_result',
  })

  expect(followup).toMatchObject({
    done: true,
  })
})

test('resolveRoundFollowup allows explicit escalation decision without requiring worker risks scaffolding', async () => {
  const runtime = await createTestRuntimeState({
    workDir: '/tmp/mimikit-followup-task-anchor-unsupported-escalate-test',
    withGlobalFocus: false,
    patch: {
      tasks: [
        createTaskFixture({
          id: 'task-finished-task-anchor-unsupported-escalate',
          title: '按整体方案推进当前整改',
          cwd: '/repo/mimikit',
          resourceMode: 'write',
          focusId: 'focus-inbox',
          status: 'succeeded',
        }),
      ],
      taskPlans: [],
    },
  })

  const followup = await resolveRoundFollowup({
    runtime,
    inputs: [],
    results: [
      {
        taskId: 'task-finished-task-anchor-unsupported-escalate',
        status: 'succeeded',
        ok: true,
        output: '已完成当前子步，但我判断需要你拍板。',
        durationMs: 12,
        completedAt: '2026-04-02T00:07:00.000Z',
        stopReason: 'completed',
        handoff: {
          summary: '当前子步已完成。',
          nextSteps: ['继续推进同一整改目标的下一批闭环'],
        },
      },
    ],
    parsed: [],
    output: '当前证据冲突，需要你拍板。',
    decision: {
      mode: 'escalate',
      reason: 'evidence_conflict',
    },
    allowAskUserChoice: true,
    resultTaskIds: new Set(['task-finished-task-anchor-unsupported-escalate']),
    wakeProfile: 'task_result',
  })

  expect(followup).toMatchObject({
    done: true,
  })
})
