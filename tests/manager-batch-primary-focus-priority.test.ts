import { expect, test } from 'vitest'

import { resolveBatchWorkingFocusIds } from '../src/policy/manager/loop-batch-primary-focus.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

const createActiveFocus = (params: {
  id: string
  title: string
  updatedAt: string
  lastActivityAt: string
}) => ({
  id: params.id,
  title: params.title,
  status: 'active' as const,
  createdAt: '2026-03-20T00:00:00.000Z',
  updatedAt: params.updatedAt,
  lastActivityAt: params.lastActivityAt,
})

test('keeps all recent user-touched focuses ahead of stale open-task worklines', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        createActiveFocus({
          id: 'focus-a',
          title: 'Focus A',
          updatedAt: '2026-03-20T00:00:01.000Z',
          lastActivityAt: '2026-03-20T00:00:01.000Z',
        }),
        createActiveFocus({
          id: 'focus-b',
          title: 'Focus B',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
        }),
        createActiveFocus({
          id: 'focus-c',
          title: 'Focus C',
          updatedAt: '2026-03-20T00:00:03.000Z',
          lastActivityAt: '2026-03-20T00:00:03.000Z',
        }),
      ],
      tasks: [
        {
          id: 'task-focus-c-open',
          title: 'Keep focus C warm',
          prompt: 'Keep focus C warm',
          cwd: '/repo',
          focusId: 'focus-c',
          profile: 'worker',
          provider: 'codex',
          status: 'running',
          createdAt: '2026-03-20T00:00:05.000Z',
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
          text: 'finish focus a after that',
          createdAt: '2026-03-20T00:00:04.000Z',
          focusId: 'focus-a',
        },
        {
          id: 'input-focus-b',
          role: 'user',
          text: 'focus b first',
          createdAt: '2026-03-20T00:00:06.000Z',
          focusId: 'focus-b',
        },
      ],
      results: [],
    }),
  ).toEqual(['focus-b', 'focus-a', 'focus-c'])
})

test('prefers a progressable plan stage before stale open-task worklines during autonomous rounds', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        createActiveFocus({
          id: 'focus-plan',
          title: 'Plan Focus',
          updatedAt: '2026-03-20T00:00:03.000Z',
          lastActivityAt: '2026-03-20T00:00:03.000Z',
        }),
        createActiveFocus({
          id: 'focus-open-task',
          title: 'Open Task Focus',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
        }),
      ],
      taskPlans: [
        {
          id: 'plan-progressable',
          title: 'Progressable Plan',
          focusId: 'focus-plan',
          priority: 'normal',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:03.000Z',
          trigger: {
            mode: 'on_worker_slot_freed',
          },
          effect: {
            kind: 'enqueue_task',
            taskKey: 'task-key-progressable',
            taskTemplate: {
              title: 'Do next plan step',
              cwd: '/repo',
              executionSpecId: 'spec-progressable',
            },
          },
          runtime: {
            runCount: 1,
            stage: {
              summary: '继续执行下一步计划收口',
              needsDecision: false,
              sourceTaskId: 'task-plan-stage',
              updatedAt: '2026-03-20T00:00:06.000Z',
            },
          },
        },
      ],
      tasks: [
        {
          id: 'task-open-task-focus',
          title: 'Stale open task',
          prompt: 'Stale open task',
          cwd: '/repo',
          focusId: 'focus-open-task',
          profile: 'worker',
          provider: 'codex',
          status: 'running',
          createdAt: '2026-03-20T00:00:01.000Z',
        },
      ],
    },
  })

  expect(
    resolveBatchWorkingFocusIds({
      runtime,
      inputs: [],
      results: [],
    }),
  ).toEqual(['focus-plan', 'focus-open-task'])
})
