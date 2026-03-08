import { expect, test } from 'vitest'

import { createControllerQueue } from '../webui/messages/controller-queue.js'

const waitForQueueFlush = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 40)
  })

test('controller queue keeps earlier snapshot when a later snapshot also arrives in the same frame', async () => {
  const appliedSnapshots: string[] = []
  const appliedTasksSnapshots: string[] = []

  const queue = createControllerQueue({
    applySnapshot: (snapshot: { name: string }) => {
      appliedSnapshots.push(snapshot.name)
    },
    applyTasksSnapshot: (tasks: { name: string }) => {
      appliedTasksSnapshots.push(tasks.name)
    },
  })

  queue.enqueueEvent({
    type: 'snapshot',
    payload: { name: 'snapshot-a' },
  })
  queue.enqueueEvent({
    type: 'snapshot',
    payload: { name: 'snapshot-b' },
  })

  await waitForQueueFlush()

  expect(appliedSnapshots).toEqual(['snapshot-a', 'snapshot-b'])
  expect(appliedTasksSnapshots).toEqual([])
})

test('controller queue coalesces tasks events and keeps ordering with snapshots', async () => {
  const appliedSnapshots: string[] = []
  const appliedTasksSnapshots: string[] = []

  const queue = createControllerQueue({
    applySnapshot: (snapshot: { name: string }) => {
      appliedSnapshots.push(snapshot.name)
    },
    applyTasksSnapshot: (tasks: { name: string }) => {
      appliedTasksSnapshots.push(tasks.name)
    },
  })

  queue.enqueueEvent({
    type: 'tasks',
    payload: { name: 'tasks-a' },
  })
  queue.enqueueEvent({
    type: 'tasks',
    payload: { name: 'tasks-b' },
  })
  queue.enqueueEvent({
    type: 'snapshot',
    payload: { name: 'snapshot-a' },
  })
  queue.enqueueEvent({
    type: 'tasks',
    payload: { name: 'tasks-c' },
  })

  await waitForQueueFlush()

  expect(appliedSnapshots).toEqual(['snapshot-a'])
  expect(appliedTasksSnapshots).toEqual(['tasks-b', 'tasks-c'])
})
