import { expect, test } from 'vitest'

import { resolveBatchWorkingFocusIds } from '../src/policy/manager/workline-focus-order.js'

import { createActiveFocus } from './helpers/manager-batch-primary-focus.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

test('returns ordered working focus ids for independent active worklines', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        createActiveFocus({
          id: 'focus-a',
          title: 'Focus A',
          updatedAt: '2026-03-20T00:00:00.000Z',
          lastActivityAt: '2026-03-20T00:00:00.000Z',
        }),
        createActiveFocus({
          id: 'focus-b',
          title: 'Focus B',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
        }),
      ],
      tasks: [
        {
          id: 'task-focus-a',
          title: 'Continue focus A',
          prompt: 'Continue focus A',
          cwd: '/repo',
          focusId: 'focus-a',
          profile: 'worker',
          provider: 'codex',
          status: 'running',
          createdAt: '2026-03-20T00:00:01.000Z',
        },
        {
          id: 'task-focus-b',
          title: 'Wrap focus B',
          prompt: 'Wrap focus B',
          cwd: '/repo',
          focusId: 'focus-b',
          profile: 'worker',
          provider: 'codex',
          status: 'succeeded',
          createdAt: '2026-03-20T00:00:02.000Z',
        },
      ],
    },
  })

  expect(
    resolveBatchWorkingFocusIds({
      runtime,
      inputs: [
        {
          id: 'input-focus-a',
          role: 'user',
          text: 'continue focus a',
          createdAt: '2026-03-20T00:00:03.000Z',
          focusId: 'focus-a',
        },
        {
          id: 'input-focus-b',
          role: 'user',
          text: 'continue focus b',
          createdAt: '2026-03-20T00:00:04.000Z',
          focusId: 'focus-b',
        },
      ],
      results: [
        {
          taskId: 'task-focus-b',
          status: 'succeeded',
          ok: true,
          output: 'done',
          durationMs: 1,
          completedAt: '2026-03-20T00:00:05.000Z',
        },
      ],
    }),
  ).toEqual(['focus-b', 'focus-a'])
})

test('keeps trigger-driven focus without dropping the most recent user focus', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        createActiveFocus({
          id: 'focus-a',
          title: 'Focus A',
          updatedAt: '2026-03-20T00:00:03.000Z',
          lastActivityAt: '2026-03-20T00:00:03.000Z',
        }),
        createActiveFocus({
          id: 'focus-c',
          title: 'Focus C',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
        }),
      ],
      taskPlans: [
        {
          id: 'plan-c',
          title: 'Plan C',
          focusId: 'focus-c',
          priority: 'normal',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:02.000Z',
          trigger: {
            mode: 'scheduled_at',
            scheduledAt: '2026-03-20T00:10:00.000Z',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-plan-c',
            taskTemplate: {
              title: 'Do C',
              cwd: '/repo',
              executionSpecId: 'spec-plan-c',
            },
          },
          runtime: {
            runCount: 0,
          },
        },
      ],
    },
  })

  expect(
    resolveBatchWorkingFocusIds({
      runtime,
      inputs: [
        {
          id: 'input-trigger-plan-c',
          role: 'system',
          visibility: 'all',
          text: 'trigger fired',
          createdAt: '2026-03-20T00:00:01.000Z',
          focusId: 'focus-c',
          systemEventName: 'trigger_fire',
          systemEventPayload: {
            plan_id: 'plan-c',
          },
        },
        {
          id: 'input-user-focus-a',
          role: 'user',
          text: 'check focus a',
          createdAt: '2026-03-20T00:00:04.000Z',
          focusId: 'focus-a',
        },
      ],
      results: [],
    }),
  ).toEqual(['focus-a', 'focus-c'])
})
