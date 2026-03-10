import { expect, test, vi } from 'vitest'

import { dispatchChannelPassiveReply } from '../../src/channels/shared/passive-dispatch.js'
import { createTestRuntimeState } from '../../tests/helpers/runtime-state.js'

import type { RuntimeState } from '../../src/orchestrator/core/runtime-state.js'
import type { UserInput } from '../../src/types/index.js'

type DemoUserInput = Extract<UserInput, { role: 'user' }> & {
  source: 'telegram'
  telegramChatId?: string
  telegramMessageId?: string
}

const appendLogMock = vi.fn(async () => undefined)

vi.mock('../../src/log/append.js', () => ({
  appendLog: (...args: unknown[]) => appendLogMock(...args),
}))

const createRuntime = async (): Promise<RuntimeState> => createTestRuntimeState()

test('dispatchChannelPassiveReply logs skipped event when target is missing', async () => {
  appendLogMock.mockClear()
  const runtime = await createRuntime()

  await dispatchChannelPassiveReply<DemoUserInput>({
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
    enabled: true,
    sourceLabel: 'telegram',
    missingTargetReason: 'missing_chat_id',
    resolveLatestInput: (inputs) => inputs[inputs.length - 1] as DemoUserInput,
    resolveTargetId: () => '',
    buildMissingTargetLog: (input) => ({
      inputId: input.id,
      messageId: input.telegramMessageId,
    }),
    sendMessage: async () => ({ messageId: 'unused' }),
    buildSentLog: () => ({}),
  })

  expect(appendLogMock).toHaveBeenCalledTimes(1)
  expect(appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'telegram_reply_skipped',
      reason: 'missing_chat_id',
      inputId: 'input-telegram-1',
    }),
  )
})

test('dispatchChannelPassiveReply sends and logs sent event', async () => {
  appendLogMock.mockClear()
  const runtime = await createRuntime()
  const sendMessage = vi.fn(async () => ({ messageId: 'reply-1' }))

  await dispatchChannelPassiveReply<DemoUserInput>({
    runtime,
    inputs: [
      {
        id: 'input-telegram-1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-03-07T00:00:00.000Z',
        focusId: 'focus-global',
        source: 'telegram',
        telegramChatId: '1001',
        telegramMessageId: '11',
      },
    ],
    replyText: 'reply text',
    enabled: true,
    sourceLabel: 'telegram',
    resolveLatestInput: (inputs) => inputs[inputs.length - 1] as DemoUserInput,
    resolveTargetId: (input) => input.telegramChatId?.trim() ?? '',
    buildMissingTargetLog: () => ({}),
    sendMessage,
    buildSentLog: ({ input, targetId, sentMessageId }) => ({
      inputId: input.id,
      chatId: targetId,
      messageId: input.telegramMessageId,
      telegramReplyMessageId: sentMessageId,
    }),
  })

  expect(sendMessage).toHaveBeenCalledWith({ targetId: '1001', text: 'reply text' })
  expect(appendLogMock).toHaveBeenCalledTimes(1)
  expect(appendLogMock).toHaveBeenCalledWith(
    runtime.paths.log,
    expect.objectContaining({
      event: 'telegram_reply_sent',
      chatId: '1001',
      telegramReplyMessageId: 'reply-1',
    }),
  )
})
