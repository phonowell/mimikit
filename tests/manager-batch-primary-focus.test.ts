import { beforeEach, expect, test, vi } from 'vitest'

import { resolveBatchWorkingFocusIds } from '../src/policy/manager/loop-batch-primary-focus.js'
import { runManagerBatch } from '../src/policy/manager/loop-batch-run-manager.js'
import { createTestRuntimeState } from './helpers/runtime-state.js'

const { runManagerCorrectionRoundsMock } = vi.hoisted(() => ({
  runManagerCorrectionRoundsMock: vi.fn(),
}))

const { logManagerBatchStartMock } = vi.hoisted(() => ({
  logManagerBatchStartMock: vi.fn(async () => undefined),
}))

vi.mock('../src/policy/manager/loop-batch-run-rounds.js', () => ({
  runManagerCorrectionRounds: runManagerCorrectionRoundsMock,
}))

vi.mock('../src/policy/manager/loop-batch-run-helpers.js', () => ({
  logManagerBatchStart: logManagerBatchStartMock,
}))

beforeEach(() => {
  runManagerCorrectionRoundsMock.mockReset()
  runManagerCorrectionRoundsMock.mockResolvedValue({
    parsed: { text: '', actions: [] },
    elapsedMs: 1,
  })
  logManagerBatchStartMock.mockClear()
})

test('runManagerBatch passes the ordered working focus ids into correction rounds', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        {
          id: 'focus-a',
          title: 'Focus A',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
          lastActivityAt: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'focus-b',
          title: 'Focus B',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:01.000Z',
          lastActivityAt: '2026-03-20T00:00:01.000Z',
        },
      ],
    },
  })

  await runManagerBatch({
    runtime,
    inputs: [
      {
        id: 'input-older',
        role: 'user',
        text: 'older',
        createdAt: '2026-03-20T00:00:00.000Z',
        focusId: 'focus-a',
      },
      {
        id: 'input-latest',
        role: 'user',
        text: 'latest',
        createdAt: '2026-03-20T00:00:02.000Z',
        focusId: 'focus-b',
      },
    ],
    results: [],
  })

  expect(runManagerCorrectionRoundsMock).toHaveBeenCalledTimes(1)
  expect(runManagerCorrectionRoundsMock.mock.calls[0]?.[0]).toMatchObject({
    workingFocusIds: ['focus-b', 'focus-a'],
  })
})

test('returns ordered working focus ids for independent active worklines', async () => {
  const runtime = await createTestRuntimeState({
    withGlobalFocus: false,
    patch: {
      focuses: [
        {
          id: 'focus-a',
          title: 'Focus A',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:00.000Z',
          lastActivityAt: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'focus-b',
          title: 'Focus B',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
        },
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
        {
          id: 'focus-a',
          title: 'Focus A',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:03.000Z',
          lastActivityAt: '2026-03-20T00:00:03.000Z',
        },
        {
          id: 'focus-c',
          title: 'Focus C',
          status: 'active',
          createdAt: '2026-03-20T00:00:00.000Z',
          updatedAt: '2026-03-20T00:00:02.000Z',
          lastActivityAt: '2026-03-20T00:00:02.000Z',
        },
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
