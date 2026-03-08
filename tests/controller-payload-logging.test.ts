import { expect, test, vi } from 'vitest'

import { createSessionIngressLogger } from '../src/http/session-ingress-log.js'

type LogCall = {
  tag: string
  payload: unknown
}

const createSpySink = () => {
  const calls: LogCall[] = []
  const sink = (tag: string, payload: unknown) => {
    calls.push({ tag, payload })
  }
  return { calls, sink }
}

test('session ingress logger logs role/type/source/visibility/summary on node side', () => {
  const { calls, sink } = createSpySink()
  const logger = createSessionIngressLogger({ sink })
  const payload = {
    mode: 'full',
    messages: [
      {
        id: 'input-1',
        role: 'user',
        text: 'Please summarize the latest task status',
        createdAt: '2026-03-06T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'webui',
      },
      {
        id: 'sys-1',
        role: 'system',
        visibility: 'all',
        text: 'Selected option "Report".\n\n<M:system_event name="user_choice" version="1">{"source":"timeout"}</M:system_event>',
        createdAt: '2026-03-06T00:00:01.000Z',
        focusId: 'focus-global',
      },
    ],
  }

  logger.logIncomingMessages(payload)
  logger.logIncomingMessages(payload)

  const messageLogs = calls.filter(
    (call) => call.tag === '[http] session ingress message',
  )
  expect(messageLogs).toHaveLength(2)
  expect(messageLogs[0]?.payload).toMatchObject({
    role: 'user',
    type: 'user_message',
    source: 'webui',
    visibility: 'all',
    summary: 'Please summarize the latest task status',
  })
  expect(messageLogs[1]?.payload).toMatchObject({
    role: 'system',
    type: 'system_event:user_choice',
    source: 'timeout',
    visibility: 'all',
    summary: 'Selected option "Report".',
  })

  const batchLogs = calls.filter((call) => call.tag === '[http] session ingress batch')
  expect(batchLogs).toHaveLength(2)
  expect(batchLogs[0]?.payload).toMatchObject({
    mode: 'full',
    incomingCount: 2,
    loggedCount: 2,
    skippedCount: 0,
  })
  expect(batchLogs[1]?.payload).toMatchObject({
    mode: 'full',
    incomingCount: 2,
    loggedCount: 0,
    skippedCount: 2,
  })
})

test('session ingress logger re-logs a message when the same id carries a new summary', () => {
  const { calls, sink } = createSpySink()
  const logger = createSessionIngressLogger({ sink })
  logger.logIncomingMessages({
    mode: 'full',
    messages: [
      {
        id: 'agent-1',
        role: 'agent',
        text: 'Draft v1',
        createdAt: '2026-03-06T00:00:00.000Z',
        focusId: 'focus-global',
      },
    ],
  })
  logger.logIncomingMessages({
    mode: 'full',
    messages: [
      {
        id: 'agent-1',
        role: 'agent',
        text: 'Draft v2',
        createdAt: '2026-03-06T00:00:01.000Z',
        focusId: 'focus-global',
      },
    ],
  })

  const messageLogs = calls.filter(
    (call) => call.tag === '[http] session ingress message',
  )
  expect(messageLogs).toHaveLength(2)
  expect(messageLogs[0]?.payload).toMatchObject({ summary: 'Draft v1' })
  expect(messageLogs[1]?.payload).toMatchObject({ summary: 'Draft v2' })
})

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
