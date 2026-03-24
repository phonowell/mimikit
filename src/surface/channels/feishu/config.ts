import { z } from 'zod'

import { assertRequiredChannelFields } from '../shared/channel-config.js'
import {
  applyTrimmedEnv,
  parseChannelEnabledEnv,
} from '../shared/config-env.js'

export const feishuConfigSchema = z
  .object({
    enabled: z.boolean(),
    appId: z.string(),
    appSecret: z.string(),
    chatId: z.string(),
  })
  .strict()

export type FeishuConfig = z.infer<typeof feishuConfigSchema>

export const applyFeishuEnvOverrides = (config: FeishuConfig): void => {
  const enabled = parseChannelEnabledEnv({
    value: process.env.FEISHU_CHANNEL_ENABLED,
    envName: 'FEISHU_CHANNEL_ENABLED',
  })
  if (enabled !== undefined) config.enabled = enabled
  applyTrimmedEnv({
    value: process.env.FEISHU_APP_ID,
    assign: (next) => {
      config.appId = next
    },
  })
  applyTrimmedEnv({
    value: process.env.FEISHU_APP_SECRET,
    assign: (next) => {
      config.appSecret = next
    },
  })
  applyTrimmedEnv({
    value: process.env.FEISHU_CHAT_ID,
    assign: (next) => {
      config.chatId = next
    },
  })
}

export const assertEnabledFeishuConfig = (config: FeishuConfig): void => {
  assertRequiredChannelFields({
    channel: 'feishu',
    fields: [
      { key: 'appId', value: config.appId },
      { key: 'appSecret', value: config.appSecret },
    ],
    messageKeys: ['appId', 'appSecret'],
  })
  const chatId = config.chatId.trim()
  if (chatId && !chatId.startsWith('oc_')) {
    throw new Error(
      '[config] feishu.chatId must start with "oc_" when provided',
    )
  }
}
