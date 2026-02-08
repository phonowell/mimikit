import { expect, test } from 'vitest'

import { buildNotificationPayload } from '../src/webui/messages/notification.js'

const createMessage = (params: {
  id: string
  role: 'user' | 'thinker' | 'system'
  text: string
}) => ({
  id: params.id,
  role: params.role,
  text: params.text,
  createdAt: '2026-01-01T10:00:00.000Z',
})

test('buildNotificationPayload skips active page and empty changes', () => {
  const messages = [createMessage({ id: 'm-1', role: 'assistant', text: 'hello' })]
  expect(
    buildNotificationPayload({
      messages,
      newMessageIds: new Set(['m-1']),
      pageActive: true,
      lastNotifiedAgentMessageId: null,
    }),
  ).toBeNull()
  expect(
    buildNotificationPayload({
      messages,
      newMessageIds: new Set(),
      pageActive: false,
      lastNotifiedAgentMessageId: null,
    }),
  ).toBeNull()
})

test('buildNotificationPayload picks latest new thinker message', () => {
  const messages = [
    createMessage({ id: 'u-1', role: 'user', text: 'question' }),
    createMessage({ id: 'm-1', role: 'assistant', text: 'first reply' }),
    createMessage({ id: 's-1', role: 'system', text: 'note' }),
    createMessage({ id: 'm-2', role: 'assistant', text: 'second reply' }),
  ]
  expect(
    buildNotificationPayload({
      messages,
      newMessageIds: new Set(['m-1', 'm-2', 's-1']),
      pageActive: false,
      lastNotifiedAgentMessageId: null,
    }),
  ).toEqual({
    messageId: 'm-2',
    title: 'Mimikit · 2 new replies',
    body: 'second reply',
  })
})

test('buildNotificationPayload skips already notified id and truncates body', () => {
  const longText = `${'x'.repeat(220)}\n  line`
  const messages = [createMessage({ id: 'm-2', role: 'assistant', text: longText })]
  expect(
    buildNotificationPayload({
      messages,
      newMessageIds: new Set(['m-2']),
      pageActive: false,
      lastNotifiedAgentMessageId: 'm-2',
    }),
  ).toBeNull()

  const payload = buildNotificationPayload({
    messages,
    newMessageIds: new Set(['m-2']),
    pageActive: false,
    lastNotifiedAgentMessageId: null,
  })
  expect(payload?.title).toBe('Mimikit · New reply')
  expect(payload?.body.endsWith('…')).toBe(true)
  expect(payload?.body.length).toBe(160)
})


