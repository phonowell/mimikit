import { expect, test } from 'vitest'

import { buildDeltaSnapshot } from '../src/http/routes-api-events-shared.js'

test('buildDeltaSnapshot excludes review status and keeps the remaining snapshot shape', async () => {
  const orchestrator = {
    getStatus: () => ({ ok: true }),
    getChatMessages: async () => ({ messages: [], mode: 'delta' as const }),
    getTasks: () => ({ tasks: [], counts: {} }),
    getPlans: () => ({ items: [] }),
    getFocuses: () => ({ items: [] }),
    getPendingUserChoice: () => null,
  }

  const snapshot = await buildDeltaSnapshot(
    orchestrator as Parameters<typeof buildDeltaSnapshot>[0],
    'msg-1',
  )

  expect(snapshot).toEqual({
    status: { ok: true },
    messages: { messages: [], mode: 'delta' },
    tasks: { tasks: [], counts: {} },
    plans: { items: [] },
    focuses: { items: [] },
    choice: null,
  })
})
