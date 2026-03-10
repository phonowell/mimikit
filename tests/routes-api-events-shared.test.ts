import { expect, test, vi } from 'vitest'

import { buildDeltaSnapshot } from '../src/http/routes-api-events-shared.js'

test('buildDeltaSnapshot refreshes duty status from the non-task snapshot path only', async () => {
  const getDutyStatus = vi.fn(async () => ({ cards: [], highlights: [] }))
  const orchestrator = {
    getStatus: () => ({ ok: true }),
    getChatMessages: async () => ({ messages: [], mode: 'delta' as const }),
    getTasks: () => ({ tasks: [], counts: {} }),
    getPlans: () => ({ items: [] }),
    getFocuses: () => ({ items: [] }),
    getPendingUserChoice: () => null,
    getDutyStatus,
  }

  const snapshot = await buildDeltaSnapshot(
    orchestrator as Parameters<typeof buildDeltaSnapshot>[0],
    'msg-1',
  )

  expect(snapshot.dutyStatus).toEqual({ cards: [], highlights: [] })
  expect(getDutyStatus).toHaveBeenCalledWith(true)
})
