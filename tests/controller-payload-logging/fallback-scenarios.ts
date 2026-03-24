import { expect, test, vi } from 'vitest'

import { createSessionIngressLogger } from '../../src/surface/http/session-ingress-log.js'

import { createSpySink } from './testkit.js'

test('session ingress logger falls back to platform when source is missing', () => {
  const { calls, sink } = createSpySink()
  const logger = createSessionIngressLogger({ sink })
  logger.logIncomingMessages({
    mode: 'full',
    messages: [
      {
        id: 'input-telegram-1',
        role: 'user',
        text: 'Ping from Telegram',
        createdAt: '2026-03-06T00:00:00.000Z',
        focusId: 'focus-global',
        platform: 'telegram',
      },
    ],
  })

  const messageLogs = calls.filter(
    (call) => call.tag === '[http] session ingress message',
  )
  expect(messageLogs).toHaveLength(1)
  expect(messageLogs[0]?.payload).toMatchObject({
    role: 'user',
    type: 'user_message',
    source: 'telegram',
    visibility: 'all',
    summary: 'Ping from Telegram',
  })
})

test('session ingress logger uses structured system metadata when text is already stripped', () => {
  const { calls, sink } = createSpySink()
  const logger = createSessionIngressLogger({ sink })
  logger.logIncomingMessages({
    mode: 'delta',
    messages: [
      {
        id: 'sys-structured-1',
        role: 'system',
        visibility: 'all',
        text: 'A worker slot was freed for new tasks.',
        systemEventName: 'worker_slot_freed',
        systemEventPayload: {
          source: 'scheduler',
          available_slots: 1,
        },
        createdAt: '2026-03-06T00:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
  })

  const messageLogs = calls.filter(
    (call) => call.tag === '[http] session ingress message',
  )
  expect(messageLogs).toHaveLength(1)
  expect(messageLogs[0]?.payload).toMatchObject({
    role: 'system',
    type: 'system_event:worker_slot_freed',
    source: 'scheduler',
    visibility: 'all',
    summary: 'A worker slot was freed for new tasks.',
  })
})

test('session ingress logger defaults to silent sink when no sink is provided', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    const logger = createSessionIngressLogger()
    logger.logIncomingMessages({
      mode: 'full',
      messages: [
        {
          id: 'input-webui-1',
          role: 'user',
          text: 'hello from webui',
          createdAt: '2026-03-08T00:00:00.000Z',
          focusId: 'focus-global',
          source: 'webui',
        },
      ],
    })
    expect(infoSpy).not.toHaveBeenCalled()
  } finally {
    infoSpy.mockRestore()
  }
})
