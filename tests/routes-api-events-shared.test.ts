import { expect, test, vi } from 'vitest'

import { buildDeltaSnapshot } from '../src/http/routes-api-events-shared.js'

test('buildDeltaSnapshot refreshes review status from the non-task snapshot path only', async () => {
  const getReviewStatus = vi.fn(async () => ({ cards: [], highlights: [] }))
  const orchestrator = {
    getStatus: () => ({ ok: true }),
    getChatMessages: async () => ({ messages: [], mode: 'delta' as const }),
    getTasks: () => ({ tasks: [], counts: {} }),
    getPlans: () => ({ items: [] }),
    getFocuses: () => ({ items: [] }),
    getPendingUserChoice: () => null,
    getReviewStatus,
  }

  const snapshot = await buildDeltaSnapshot(
    orchestrator as Parameters<typeof buildDeltaSnapshot>[0],
    'msg-1',
  )

  expect(snapshot.reviewStatus).toEqual({ cards: [], highlights: [] })
  expect(getReviewStatus).toHaveBeenCalledWith(true)
})
