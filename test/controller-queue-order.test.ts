import { expect, test } from 'vitest'

import { createControllerQueue } from '../webui/messages/controller-queue.js'

const waitForQueueFlush = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 40)
  })

test('controller queue keeps earlier snapshot when a later snapshot also arrives in the same frame', async () => {
  const appliedSnapshots: string[] = []
  const appliedStreamTexts: string[] = []
  let currentStreamMessage: unknown = null

  const queue = createControllerQueue({
    applySnapshot: (snapshot: { name: string }) => {
      appliedSnapshots.push(snapshot.name)
    },
    applyMessagesPayload: (_messagesPayload, streamMessage) => {
      const text =
        streamMessage && typeof streamMessage === 'object' && 'text' in streamMessage
          ? String(streamMessage.text ?? '')
          : ''
      appliedStreamTexts.push(text)
    },
    getCurrentStreamMessage: () => currentStreamMessage,
    setCurrentStreamMessage: (value) => {
      currentStreamMessage = value
    },
  })

  queue.enqueueEvent({
    type: 'snapshot',
    payload: { name: 'snapshot-a' },
  })
  queue.enqueueEvent({
    type: 'stream',
    payload: { mode: 'delta', id: 'stream-a', delta: 'hello' },
  })
  queue.enqueueEvent({
    type: 'snapshot',
    payload: { name: 'snapshot-b' },
  })

  await waitForQueueFlush()

  expect(appliedSnapshots).toEqual(['snapshot-a', 'snapshot-b'])
  expect(appliedStreamTexts).toEqual(['hello'])
})
