import { expect, test } from 'vitest'

import { collectTriggeredPlanIds } from '../src/manager/loop-batch-context.js'

test('collectTriggeredPlanIds reads structured trigger metadata from system inputs', () => {
  const ids = collectTriggeredPlanIds([
    {
      id: 'input-trigger-1',
      role: 'system',
      visibility: 'all',
      text: 'Plan "nightly cleanup" was triggered.',
      systemEventName: 'trigger_fire',
      systemEventPayload: {
        plan_id: 'plan-nightly-cleanup',
      },
      createdAt: '2026-03-06T00:00:00.000Z',
      focusId: 'focus-main',
    },
  ])

  expect([...ids]).toEqual(['plan-nightly-cleanup'])
})
