import { expect, test } from 'vitest'

import { renderStreamMessage } from '../webui/messages/render-stream.js'

test('renderStreamMessage keeps previous stream bubble when stream is cleared', () => {
  const classSet = new Set(['message--streaming'])
  let removeCalled = false
  const messagesEl = {
    scrollTop: 16,
    scrollHeight: 100,
    querySelector: () => null,
  }
  const streamItem = {
    parentElement: messagesEl,
    dataset: { messageId: 'stream-a' },
    classList: {
      contains: (name: string) => classSet.has(name),
      remove: (name: string) => {
        classSet.delete(name)
      },
    },
    remove: () => {
      removeCalled = true
    },
  }
  const streamingItemRef = { current: streamItem }
  let scrollUpdated = false

  renderStreamMessage({
    streamMessage: null,
    messagesEl,
    removeEmpty: () => {},
    isNearBottom: () => false,
    scrollToBottom: () => {},
    updateScrollButton: () => {
      scrollUpdated = true
    },
    formatUsage: () => null,
    streamingItemRef,
  })

  expect(removeCalled).toBe(false)
  expect(classSet.has('message--streaming')).toBe(false)
  expect(streamingItemRef.current).toBe(null)
  expect(scrollUpdated).toBe(true)
})
