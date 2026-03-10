import { z } from 'zod'

import { assertRequiredChannelFields } from '../shared/channel-config.js'
import {
  applyTrimmedEnv,
  parseChannelEnabledEnv,
} from '../shared/config-env.js'

export const telegramConfigSchema = z
  .object({
    enabled: z.boolean(),
    botToken: z.string(),
    chatId: z.string(),
    apiRoot: z.string().min(1),
    proxy: z.string(),
  })
  .strict()

export type TelegramConfig = z.infer<typeof telegramConfigSchema>

export const applyTelegramEnvOverrides = (config: TelegramConfig): void => {
  const enabled = parseChannelEnabledEnv({
    value: process.env.TELEGRAM_CHANNEL_ENABLED,
    envName: 'TELEGRAM_CHANNEL_ENABLED',
  })
  if (enabled !== undefined) config.enabled = enabled
  applyTrimmedEnv({
    value: process.env.TELEGRAM_BOT_TOKEN,
    assign: (next) => {
      config.botToken = next
    },
  })
  applyTrimmedEnv({
    value: process.env.TELEGRAM_CHAT_ID,
    assign: (next) => {
      config.chatId = next
    },
  })
  applyTrimmedEnv({
    value: process.env.TELEGRAM_API_ROOT,
    assign: (next) => {
      config.apiRoot = next
    },
  })
  applyTrimmedEnv({
    value: process.env.TELEGRAM_PROXY,
    assign: (next) => {
      config.proxy = next
    },
  })
}

export const assertEnabledTelegramConfig = (config: TelegramConfig): void => {
  assertRequiredChannelFields({
    channel: 'telegram',
    fields: [
      { key: 'botToken', value: config.botToken },
      { key: 'chatId', value: config.chatId },
    ],
    messageKeys: ['botToken', 'chatId'],
  })
}
