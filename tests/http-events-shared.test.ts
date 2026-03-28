import { expect, test } from 'vitest'

import { buildSnapshotHintKey } from '../src/surface/http/routes-api-events-shared.js'

test('buildSnapshotHintKey ignores plans and focuses once they stream separately', () => {
  const base = buildSnapshotHintKey({
    status: { agentStatus: 'idle' },
    tasks: { tasks: [{ id: 'task-1' }] },
    plans: { items: [{ id: 'plan-1' }] },
    focuses: { items: [{ id: 'focus-1' }] },
  })

  const changed = buildSnapshotHintKey({
    status: { agentStatus: 'idle' },
    tasks: { tasks: [{ id: 'task-1' }] },
    plans: { items: [{ id: 'plan-2' }] },
    focuses: { items: [{ id: 'focus-2' }] },
  })

  expect(changed).toBe(base)
})
