import { afterEach, expect, test, vi } from 'vitest'

import { dispatchTelegramPassiveReply } from '../../src/channels/telegram/passive-reply.js'
import { createTestRuntimeState } from '../../tests/helpers/runtime-state.js'

import type { RuntimeState } from '../../src/orchestrator/core/runtime-state.js'

const mockedSendTelegramTextMessage = vi.fn(async () => ({ messageId: 'msg-1' }))

vi.mock('../../src/channels/telegram/client.js', () => ({
  sendTelegramTextMessage: (...args: unknown[]) =>
    mockedSendTelegramTextMessage(...args),
}))

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState()
  runtime.config.telegram.enabled = true
  runtime.config.telegram.botToken = 'bot-token'
  runtime.config.telegram.chatId = 'fallback-chat-id'
  runtime.config.telegram.apiRoot = 'https://api.telegram.org'
  runtime.config.telegram.proxy = ''
  return runtime
}

afterEach(() => {
  mockedSendTelegramTextMessage.mockClear()
})

test('dispatchTelegramPassiveReply falls back to configured chat id when input chat id is missing', async () => {
  const runtime = await createRuntime()
  await dispatchTelegramPassiveReply({
    runtime,
    inputs: [
      {
        id: 'input-telegram-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'telegram',
      },
    ],
    replyText: 'reply text',
  })

  expect(mockedSendTelegramTextMessage).toHaveBeenCalledWith({
    botToken: 'bot-token',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
    chatId: 'fallback-chat-id',
    text: 'reply text',
  })
})
