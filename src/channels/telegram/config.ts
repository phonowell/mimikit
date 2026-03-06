import { z } from 'zod'

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

const parseEnvBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (normalized === '1' || normalized === 'true' || normalized === 'yes')
    return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no')
    return false
  console.warn('[cli] invalid TELEGRAM_CHANNEL_ENABLED:', value)
  return undefined
}

export const applyTelegramEnvOverrides = (config: TelegramConfig): void => {
  const enabled = parseEnvBoolean(process.env.TELEGRAM_CHANNEL_ENABLED)
  if (enabled !== undefined) config.enabled = enabled
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (botToken) config.botToken = botToken
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (chatId) config.chatId = chatId
  const apiRoot = process.env.TELEGRAM_API_ROOT?.trim()
  if (apiRoot) config.apiRoot = apiRoot
  const proxy = process.env.TELEGRAM_PROXY?.trim()
  if (proxy) config.proxy = proxy
}

export const assertEnabledTelegramConfig = (config: TelegramConfig): void => {
  if (!config.botToken.trim() || !config.chatId.trim()) {
    throw new Error(
      '[config] telegram.enabled=true requires telegram.botToken and telegram.chatId',
    )
  }
}
