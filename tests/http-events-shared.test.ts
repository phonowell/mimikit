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

test('buildSnapshotHintKey ignores tasks once tasks stream separately', () => {
  const base = buildSnapshotHintKey({
    status: { agentStatus: 'idle', activeTasks: 0 },
    tasks: { tasks: [{ id: 'task-1', status: 'pending' }] },
  })

  const changed = buildSnapshotHintKey({
    status: { agentStatus: 'idle', activeTasks: 0 },
    tasks: {
      tasks: [
        { id: 'task-1', status: 'running', liveOutput: 'partial output' },
        { id: 'task-2', status: 'pending' },
      ],
    },
  })

  expect(changed).toBe(base)
})

test('buildSnapshotHintKey still changes when snapshot status changes', () => {
  const idle = buildSnapshotHintKey({
    status: { agentStatus: 'idle', activeTasks: 0 },
    tasks: { tasks: [{ id: 'task-1', status: 'pending' }] },
  })

  const running = buildSnapshotHintKey({
    status: { agentStatus: 'running', activeTasks: 1 },
    tasks: { tasks: [{ id: 'task-1', status: 'running' }] },
  })

  expect(running).not.toBe(idle)
})
