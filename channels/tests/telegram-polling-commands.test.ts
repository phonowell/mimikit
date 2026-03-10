import { afterEach, expect, test, vi } from 'vitest'

import {
  MockTelegraf,
  buildTextContext,
  startPolling,
  stopAllPollers,
} from './helpers/telegram-polling-testkit.js'

vi.mock('../src/log.js', () => ({
  appendLog: async () => undefined,
}))

vi.mock('../src/channels/telegram/config.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../src/channels/telegram/config.js')>()
  return {
    ...actual,
    assertEnabledTelegramConfig: () => undefined,
  }
})

vi.mock('../src/channels/telegram/proxy.js', () => ({
  resolveTelegramProxy: () => ({ proxyAgent: undefined }),
}))

vi.mock('telegraf', () => ({
  Telegraf: MockTelegraf,
}))

afterEach(async () => {
  await stopAllPollers()
})

test('private /mmk help replies help and does not enqueue user input', async () => {
  const addUserInput = vi.fn(async () => 'input-ignored')
  const restart = vi.fn(() => 'scheduled' as const)
  const reply = vi.fn(async (text: string) => {
  void text
  return undefined
})
  const { bot } = await startPolling({ addUserInput, requestRestart: restart })

  await bot.emitText(buildTextContext({ text: '/mmk help', reply }))

  expect(addUserInput).not.toHaveBeenCalled()
  expect(restart).not.toHaveBeenCalled()
  expect(reply).toHaveBeenCalledWith('/mmk help\n/mmk restart')
})

test('private /mmk restart schedules restart and bypasses input queue', async () => {
  const addUserInput = vi.fn(async () => 'input-ignored')
  const restart = vi.fn(() => 'scheduled' as const)
  const reply = vi.fn(async (text: string) => {
  void text
  return undefined
})
  const { bot } = await startPolling({ addUserInput, requestRestart: restart })

  await bot.emitText(buildTextContext({ text: '/mmk restart', reply }))

  expect(addUserInput).not.toHaveBeenCalled()
  expect(restart).toHaveBeenCalledWith('telegram_mmk_restart')
  expect(reply).toHaveBeenCalledWith('✓ restart_scheduled')
})

test('group /mmk restart is ignored', async () => {
  const addUserInput = vi.fn(async () => 'input-ignored')
  const restart = vi.fn(() => 'scheduled' as const)
  const reply = vi.fn(async (text: string) => {
  void text
  return undefined
})
  const { bot } = await startPolling({ addUserInput, requestRestart: restart })

  await bot.emitText(
    buildTextContext({
      text: '/mmk restart',
      chatType: 'group',
      reply,
    }),
  )

  expect(addUserInput).not.toHaveBeenCalled()
  expect(restart).not.toHaveBeenCalled()
  expect(reply).not.toHaveBeenCalled()
})

test('normal private text still enters input queue', async () => {
  const addUserInput = vi.fn(async () => 'input-1')
  const { bot } = await startPolling({ addUserInput })

  await bot.emitText(buildTextContext({ text: 'hello from telegram' }))

  expect(addUserInput).toHaveBeenCalledTimes(1)
  expect(addUserInput).toHaveBeenCalledWith('hello from telegram', {
    source: 'telegram',
    platform: 'telegram',
    channel: 'telegram',
    telegramChatId: '1001',
    telegramMessageId: '11',
    telegramUpdateId: '22',
    telegramTimestamp: new Date(1_700_000_000 * 1000).toISOString(),
  })
})
