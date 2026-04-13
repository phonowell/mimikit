import { expect, test } from 'vitest'

import { resolveRoundFollowup } from '../src/policy/manager/loop-batch-round-followup.js'

import { createTaskFixture } from './helpers/runtime-snapshot.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('resolveRoundFollowup allows reply-only result follow-up when manager chooses to stop without action scaffolding', async () => {
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

  expect(followup).toMatchObject({
    done: true,
  })
})
