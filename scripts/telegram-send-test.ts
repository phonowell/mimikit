import { parseArgs } from 'node:util'

import { sendTelegramTextMessage } from '../src/channels/telegram/client.js'

const { values } = parseArgs({
  options: {
    text: { type: 'string', default: 'mimikit telegram test' },
  },
})

const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
const apiRoot = process.env.TELEGRAM_API_ROOT?.trim() ?? 'https://api.telegram.org'
const text = values.text.trim()

if (!botToken || !chatId) {
  console.error(
    'missing env: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required',
  )
  process.exit(1)
}
if (!text) {
  console.error('invalid args: --text must not be empty')
  process.exit(1)
}

const sent = await sendTelegramTextMessage({
  botToken,
  chatId,
  apiRoot,
  text,
})

console.log('telegram_send_ok', sent.messageId ?? 'no_message_id')
