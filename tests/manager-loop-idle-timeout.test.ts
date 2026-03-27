import { expect, test } from 'vitest'

import { resolveManagerIdleTimeoutMs } from '../src/policy/manager/loop-idle-timeout.js'

import { createTestRuntimeState } from './helpers/runtime-state.js'

test('manager idle timeout prefers the earliest plan trigger', async () => {
  const runtime = await createTestRuntimeState({
    patch: {
      taskPlans: [
        {
          id: 'plan-later',
          prompt: 'later',
          title: 'later',
          focusId: 'focus-global',
          profile: 'worker',
          priority: 'normal',
          source: 'user_request',
          status: 'active',
          trigger: {
            mode: 'scheduled_at',
            scheduledAt: '2026-03-10T12:00:10.000Z',
          },
          createdAt: '2026-03-10T12:00:00.000Z',
          updatedAt: '2026-03-10T12:00:00.000Z',
          runtime: { runCount: 0 },
        },
        {
          id: 'plan-earlier',
          prompt: 'earlier',
          title: 'earlier',
          focusId: 'focus-global',
          profile: 'worker',
          priority: 'normal',
          source: 'user_request',
          status: 'active',
          trigger: {
            mode: 'scheduled_at',
            scheduledAt: '2026-03-10T12:00:03.000Z',
          },
          createdAt: '2026-03-10T12:00:00.000Z',
          updatedAt: '2026-03-10T12:00:00.000Z',
          runtime: { runCount: 0 },
        },
      ],
    },
  })

  const timeoutMs = resolveManagerIdleTimeoutMs(
    runtime,
    new Date('2026-03-10T12:00:01.000Z'),
  )

  expect(timeoutMs).toBe(2_000)
})

test('manager idle timeout blocks on signal when no future trigger exists', async () => {
  const runtime = await createTestRuntimeState()
  expect(resolveManagerIdleTimeoutMs(runtime)).toBe(Number.POSITIVE_INFINITY)
})
