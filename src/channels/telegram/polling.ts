import { appendLog } from '../../log/append.js'

import { assertEnabledTelegramConfig } from './config.js'

import type { AppConfig } from '../../config.js'
import type { UserMeta } from '../../orchestrator/core/runtime-state.js'
import type { Telegraf } from 'telegraf'

type TelegramRunner = {
  bot: Telegraf
}

const runners = new Map<string, TelegramRunner>()

const toIsoFromUnixSeconds = (value: number): string =>
  new Date(value * 1000).toISOString()

export const startTelegramPolling = async (params: {
  config: AppConfig
  logPath: string
  workDir: string
  addUserInput: (
    text: string,
    meta?: UserMeta,
    quote?: string,
  ) => Promise<string>
}): Promise<void> => {
  const { config, logPath, workDir, addUserInput } = params
  if (!config.telegram.enabled) return
  if (runners.has(workDir)) return

  assertEnabledTelegramConfig(config.telegram)

  const { Telegraf } = await import('telegraf')
  const bot = new Telegraf(config.telegram.botToken, {
    telegram: {
      apiRoot: config.telegram.apiRoot,
    },
  })

  bot.catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error)
    await appendLog(logPath, {
      event: 'telegram_polling_error',
      error: message,
    })
  })

  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim()
    if (!text) return
    await addUserInput(text, {
      source: 'telegram',
      platform: 'telegram',
      telegramChatId: String(ctx.chat.id),
      telegramMessageId: String(ctx.message.message_id),
      telegramUpdateId: String(ctx.update.update_id),
      telegramTimestamp: toIsoFromUnixSeconds(ctx.message.date),
    })
  })

  try {
    await bot.launch({ dropPendingUpdates: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`telegram_polling_start_failed:${message}`)
  }

  runners.set(workDir, { bot })
  await appendLog(logPath, {
    event: 'telegram_polling_started',
    workDir,
  })
}

export const stopTelegramPolling = async (params: {
  workDir: string
  logPath: string
}): Promise<void> => {
  const runner = runners.get(params.workDir)
  if (!runner) return

  runner.bot.stop('runtime_shutdown')
  runners.delete(params.workDir)
  await appendLog(params.logPath, {
    event: 'telegram_polling_stopped',
    workDir: params.workDir,
  })
}
