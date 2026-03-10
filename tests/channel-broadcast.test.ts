import { afterEach, expect, test, vi } from 'vitest'

const mockedSendTelegramTextMessage = vi.fn(async () => ({ messageId: 'tg-1' }))
const mockedSendFeishuTextMessage = vi.fn(async () => ({ messageId: 'fs-1' }))

vi.mock('../src/orchestrator/core/channel-delivery.js', () => ({
  sendTelegramChannelText: (...args: unknown[]) =>
    mockedSendTelegramTextMessage(...args),
  sendFeishuChannelText: (...args: unknown[]) =>
    mockedSendFeishuTextMessage(...args),
}))

import {
  broadcastAgentReply,
  broadcastUserMessage,
  rememberChannelTargets,
} from '../src/orchestrator/core/channel-broadcast.js'

import type { RuntimeState, UserMeta } from '../src/orchestrator/core/runtime-state.js'
import type { UserInput } from '../src/types/index.js'

const createRuntime = (): RuntimeState =>
  ({
    config: {
      workDir: '.mimikit-test',
      telegram: {
        enabled: false,
        botToken: '',
        chatId: '',
        apiRoot: 'https://api.telegram.org',
        proxy: '',
      },
      feishu: {
        enabled: false,
        appId: '',
        appSecret: '',
        chatId: '',
      },
    },
    paths: {
      log: '/tmp/mimikit-channel-broadcast.log',
    },
    session: {
      stopped: false,
      inflightInputs: [],
      channelTargets: {},
    },
  }) as RuntimeState

afterEach(() => {
  mockedSendTelegramTextMessage.mockClear()
  mockedSendFeishuTextMessage.mockClear()
})

test('remembered telegram target lets webui user message broadcast to telegram', async () => {
  const runtime = createRuntime()
  runtime.config.telegram.enabled = true
  runtime.config.telegram.botToken = 'bot-token'

  const meta: UserMeta = {
    source: 'telegram',
    platform: 'telegram',
    channel: 'telegram',
    telegramChatId: 'chat-1001',
  }
  rememberChannelTargets(runtime, meta)

  const input: UserInput = {
    id: 'input-webui-1',
    role: 'user',
    text: 'from webui',
    createdAt: '2026-03-10T00:00:00.000Z',
    focusId: 'focus-global',
    source: 'webui',
    platform: 'webui',
  }

  await broadcastUserMessage({ runtime, input })

  expect(mockedSendTelegramTextMessage).toHaveBeenCalledTimes(1)
  expect(mockedSendTelegramTextMessage).toHaveBeenCalledWith({
    botToken: 'bot-token',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
    chatId: 'chat-1001',
    text: 'from webui',
  })
})

test('agent reply broadcasts to all enabled channels', async () => {
  const runtime = createRuntime()
  runtime.config.telegram.enabled = true
  runtime.config.telegram.botToken = 'bot-token'
  runtime.config.feishu.enabled = true
  runtime.config.feishu.appId = 'app-id'
  runtime.config.feishu.appSecret = 'app-secret'
  runtime.config.feishu.chatId = 'oc_chat_1'
  runtime.session.channelTargets.telegramChatId = 'chat-1001'

  await broadcastAgentReply({
    runtime,
    messageId: 'agent-1',
    text: 'agent says hi',
  })

  expect(mockedSendTelegramTextMessage).toHaveBeenCalledWith({
    botToken: 'bot-token',
    apiRoot: 'https://api.telegram.org',
    proxy: '',
    chatId: 'chat-1001',
    text: 'agent says hi',
  })
  expect(mockedSendFeishuTextMessage).toHaveBeenCalledWith({
    appId: 'app-id',
    appSecret: 'app-secret',
    chatId: 'oc_chat_1',
    text: 'agent says hi',
  })
})
