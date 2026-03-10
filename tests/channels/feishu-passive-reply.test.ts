import { afterEach, expect, test, vi } from 'vitest'

import { dispatchFeishuPassiveReply } from '../../src/channels/feishu/passive-reply.js'
import { createTestRuntimeState } from '../../tests/helpers/runtime-state.js'

import type { RuntimeState } from '../../src/orchestrator/core/runtime-state.js'

const mockedSendFeishuTextMessage = vi.fn(async () => ({ messageId: 'msg-1' }))

vi.mock('../../src/channels/feishu/client.js', () => ({
  sendFeishuTextMessage: (...args: unknown[]) =>
    mockedSendFeishuTextMessage(...args),
}))

const createRuntime = async (): Promise<RuntimeState> => {
  const runtime = await createTestRuntimeState()
  runtime.config.feishu.enabled = true
  runtime.config.feishu.appId = 'app-id'
  runtime.config.feishu.appSecret = 'app-secret'
  runtime.config.feishu.chatId = 'oc_fallback_chat'
  return runtime
}

afterEach(() => {
  mockedSendFeishuTextMessage.mockClear()
})

test('dispatchFeishuPassiveReply sends reply to chat from latest feishu input', async () => {
  const runtime = await createRuntime()
  await dispatchFeishuPassiveReply({
    runtime,
    inputs: [
      {
        id: 'input-feishu-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'feishu',
        feishuChatId: 'oc_from_input',
      },
    ],
    replyText: 'reply text',
  })

  expect(mockedSendFeishuTextMessage).toHaveBeenCalledWith({
    appId: 'app-id',
    appSecret: 'app-secret',
    chatId: 'oc_from_input',
    text: 'reply text',
  })
})

test('dispatchFeishuPassiveReply falls back to configured chat id when input chat id is missing', async () => {
  const runtime = await createRuntime()
  await dispatchFeishuPassiveReply({
    runtime,
    inputs: [
      {
        id: 'input-feishu-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'feishu',
      },
    ],
    replyText: 'reply text',
  })

  expect(mockedSendFeishuTextMessage).toHaveBeenCalledWith({
    appId: 'app-id',
    appSecret: 'app-secret',
    chatId: 'oc_fallback_chat',
    text: 'reply text',
  })
})
