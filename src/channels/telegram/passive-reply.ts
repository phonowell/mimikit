import { dispatchChannelPassiveReply } from '../shared/passive-dispatch.js'
import {
  hasUserInputFromSource,
  resolveLatestUserInputFromSource,
} from '../shared/passive-reply.js'

import type { RuntimeState } from '../../manager/runtime-adapter.js'
import type { UserInput } from '../../types/index.js'

type TelegramUserInput = Extract<UserInput, { role: 'user' }> & {
  source: 'telegram'
  telegramChatId?: string
  telegramMessageId?: string
  telegramUpdateId?: string
  telegramTimestamp?: string
}

const isTelegramUserInput = (input: UserInput): input is TelegramUserInput =>
  Boolean(input.role === 'user' && input.source === 'telegram')

const resolveLatestTelegramInput = (
  inputs: UserInput[],
): TelegramUserInput | undefined => {
  const latest = resolveLatestUserInputFromSource(inputs, 'telegram')
  if (!latest || !isTelegramUserInput(latest)) return undefined
  return latest
}

export const hasTelegramUserInput = (inputs: UserInput[]): boolean =>
  hasUserInputFromSource(inputs, 'telegram')

export const dispatchTelegramPassiveReply = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  replyText: string
}): Promise<void> => {
  const { runtime } = params
  await dispatchChannelPassiveReply<TelegramUserInput>({
    runtime,
    inputs: params.inputs,
    replyText: params.replyText,
    enabled: runtime.config.telegram.enabled,
    sourceLabel: 'telegram',
    missingTargetReason: 'missing_chat_id',
    resolveLatestInput: resolveLatestTelegramInput,
    resolveTargetId: (input) =>
      input.telegramChatId?.trim() ?? runtime.config.telegram.chatId.trim(),
    buildMissingTargetLog: (input) => ({
      inputId: input.id,
      messageId: input.telegramMessageId,
      updateId: input.telegramUpdateId,
    }),
    sendMessage: async ({ targetId, text }) => {
      const { sendTelegramTextMessage } = await import('./client.js')
      return sendTelegramTextMessage({
        botToken: runtime.config.telegram.botToken,
        apiRoot: runtime.config.telegram.apiRoot,
        proxy: runtime.config.telegram.proxy,
        chatId: targetId,
        text,
      })
    },
    buildSentLog: ({ input, targetId, sentMessageId }) => ({
      inputId: input.id,
      chatId: targetId,
      messageId: input.telegramMessageId,
      updateId: input.telegramUpdateId,
      ...(sentMessageId ? { telegramReplyMessageId: sentMessageId } : {}),
    }),
  })
}
