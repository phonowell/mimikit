import { Telegram } from 'telegraf'

import { resolveTelegramProxy } from './proxy.js'

type TelegramClientConfig = {
  botToken: string
  apiRoot: string
  proxy: string
}

const telegramClientCache = new Map<string, Telegram>()

const normalizeApiRoot = (value: string): string =>
  value.endsWith('/') ? value.slice(0, -1) : value

const resolveClient = (config: TelegramClientConfig): Telegram => {
  const { proxyUrl, proxyAgent } = resolveTelegramProxy(config.proxy)
  const key = `${config.botToken}\n${config.apiRoot}\n${proxyUrl ?? ''}`
  const cached = telegramClientCache.get(key)
  if (cached) return cached

  const client = new Telegram(config.botToken, {
    apiRoot: normalizeApiRoot(config.apiRoot),
    ...(proxyAgent ? { agent: proxyAgent } : {}),
  })
  telegramClientCache.set(key, client)
  return client
}

export const sendTelegramTextMessage = async (params: {
  botToken: string
  chatId: string
  text: string
  apiRoot: string
  proxy: string
}): Promise<{ messageId?: string }> => {
  const botToken = params.botToken.trim()
  const chatId = params.chatId.trim()
  const text = params.text.trim()
  const apiRoot = params.apiRoot.trim()
  const proxy = params.proxy.trim()

  if (!botToken)
    throw new Error('telegram_send_invalid_config:missing_bot_token')
  if (!chatId) throw new Error('telegram_send_invalid_config:missing_chat_id')
  if (!text) throw new Error('telegram_send_invalid_payload:empty_text')

  const client = resolveClient({ botToken, apiRoot, proxy })
  try {
    const sent = await client.sendMessage(chatId, text)
    return sent.message_id ? { messageId: String(sent.message_id) } : {}
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`telegram_send_failed:${message}`)
  }
}
