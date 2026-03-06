import { appendLog } from '../../log/append.js'

import { sendTelegramTextMessage } from './client.js'

import type { RuntimeState } from '../../manager/runtime-adapter.js'
import type { UserInput } from '../../types/index.js'

type TelegramUserInput = Extract<UserInput, { role: 'user' }> & {
  source: 'telegram'
  telegramChatId: string
  telegramMessageId?: string
  telegramUpdateId?: string
  telegramTimestamp?: string
}

const isTelegramUserInput = (input: UserInput): input is TelegramUserInput =>
  Boolean(
    input.role === 'user' &&
    input.source === 'telegram' &&
    input.telegramChatId?.trim(),
  )

const resolveLatestTelegramInput = (
  inputs: UserInput[],
): TelegramUserInput | undefined => {
  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const item = inputs[index]
    if (item && isTelegramUserInput(item)) return item
  }
  return undefined
}

export const hasTelegramUserInput = (inputs: UserInput[]): boolean =>
  inputs.some((item) => isTelegramUserInput(item))

export const dispatchTelegramPassiveReply = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  replyText: string
}): Promise<void> => {
  const { runtime, inputs } = params
  if (!runtime.config.telegram.enabled) return

  const telegramInput = resolveLatestTelegramInput(inputs)
  if (!telegramInput) return

  const content = params.replyText.trim()
  if (!content) return

  const targetChatId =
    telegramInput.telegramChatId.trim() || runtime.config.telegram.chatId.trim()
  if (!targetChatId) {
    await appendLog(runtime.paths.log, {
      event: 'telegram_reply_skipped',
      reason: 'missing_chat_id',
      inputId: telegramInput.id,
      messageId: telegramInput.telegramMessageId,
      updateId: telegramInput.telegramUpdateId,
    })
    return
  }

  const sent = await sendTelegramTextMessage({
    botToken: runtime.config.telegram.botToken,
    apiRoot: runtime.config.telegram.apiRoot,
    proxy: runtime.config.telegram.proxy,
    chatId: targetChatId,
    text: content,
  })

  await appendLog(runtime.paths.log, {
    event: 'telegram_reply_sent',
    inputId: telegramInput.id,
    chatId: targetChatId,
    messageId: telegramInput.telegramMessageId,
    updateId: telegramInput.telegramUpdateId,
    ...(sent.messageId ? { telegramReplyMessageId: sent.messageId } : {}),
  })
}
