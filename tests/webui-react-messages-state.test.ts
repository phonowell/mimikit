import { expect, test } from 'vitest'

import { applyIncomingSnapshot, createInitialAppState } from '../webui-src/lib/messages.js'

test('applyIncomingSnapshot clears awaitingReply when agent message arrives', () => {
  const current = {
    ...createInitialAppState(),
    awaitingReply: true,
    messages: [{ id: 'user-1', role: 'user', text: 'hello' }],
  }

  const { next, newAgentMessages } = applyIncomingSnapshot(current, {
    messages: {
      mode: 'delta',
      messages: [{ id: 'agent-1', role: 'agent', text: 'world' }],
    },
  })

  expect(next.awaitingReply).toBe(false)
  expect(newAgentMessages).toHaveLength(1)
  expect(next.messages.map((message) => message.id)).toEqual(['user-1', 'agent-1'])
})

test('applyIncomingSnapshot clears awaitingReply for manager fallback reply', () => {
  const current = { ...createInitialAppState(), awaitingReply: true }

  const { next } = applyIncomingSnapshot(current, {
    messages: {
      mode: 'full',
      messages: [
        {
          id: 'system-1',
          role: 'system',
          text: 'fallback',
          systemEventName: 'manager_fallback_reply',
        },
      ],
    },
  })

  expect(next.awaitingReply).toBe(false)
})
