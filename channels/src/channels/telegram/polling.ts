import { appendLog } from '../../log.js'
import { buildUnsupportedImageInputText } from '../shared/image-unsupported-input.js'

import { assertEnabledTelegramConfig } from './config.js'
import { resolveTelegramProxy } from './proxy.js'

import type { AppConfig } from '../../types.js'
import type { UserMeta } from '../../types.js'
import type { Telegraf } from 'telegraf'

type TelegramRunner = {
  bot: Telegraf
}
const runners = new Map<string, TelegramRunner>()

type MmkCommand = 'help' | 'restart'
type RestartCommandResult = 'scheduled' | 'busy' | 'already_scheduled'
type ParsedMmkCommand =
  | { kind: 'not_mmk' }
  | { kind: 'invalid' }
  | { kind: 'valid'; command: MmkCommand }
type TelegramInboundContext = {
  message: {
    message_id: number
    date: number
  }
  chat: {
    id: number
  }
  update: {
    update_id: number
  }
}

const MMK_PREFIX = '/mmk'
const MMK_HELP_TEXT = ['/mmk help', '/mmk restart'].join('\n')

const normalizeTelegramCommand = (
  commandToken: string,
): { name: string; mention?: string } => {
  const [rawName, rawMention] = commandToken.split('@')
  const name = rawName?.toLowerCase() ?? ''
  if (!rawMention) return { name }
  return { name, mention: rawMention }
}

const parseMmkCommand = (
  text: string,
  botUsername?: string,
): ParsedMmkCommand => {
  const [commandToken, ...args] = text.trim().split(/\s+/)
  if (!commandToken) return { kind: 'not_mmk' }
  const { name, mention } = normalizeTelegramCommand(commandToken)
  if (name !== MMK_PREFIX) return { kind: 'not_mmk' }
  if (mention && mention.toLowerCase() !== botUsername?.toLowerCase())
    return { kind: 'not_mmk' }

  const subCommand = args[0]?.toLowerCase()
  if (!subCommand || subCommand === 'help')
    return { kind: 'valid', command: 'help' }
  if (subCommand === 'restart') return { kind: 'valid', command: 'restart' }
  return { kind: 'invalid' }
}

const toIsoFromUnixSeconds = (value: number): string =>
  new Date(value * 1000).toISOString()

const buildTelegramUserMeta = (ctx: TelegramInboundContext): UserMeta => ({
  source: 'telegram',
  platform: 'telegram',
  channel: 'telegram',
  telegramChatId: String(ctx.chat.id),
  telegramMessageId: String(ctx.message.message_id),
  telegramUpdateId: String(ctx.update.update_id),
  telegramTimestamp: toIsoFromUnixSeconds(ctx.message.date),
})

export const startTelegramPolling = async (params: {
  config: AppConfig
  logPath: string
  workDir: string
  addUserInput: (
    text: string,
    meta?: UserMeta,
    quote?: string,
  ) => Promise<string>
  requestRestart?: (
    reason: string,
  ) => RestartCommandResult | Promise<RestartCommandResult>
}): Promise<void> => {
  const { config, logPath, workDir, addUserInput, requestRestart } = params
  if (!config.telegram.enabled) return
  if (runners.has(workDir)) return

  assertEnabledTelegramConfig(config.telegram)

  const { Telegraf } = await import('telegraf')
  const { proxyAgent } = resolveTelegramProxy(config.telegram.proxy)
  const bot = new Telegraf(config.telegram.botToken, {
    telegram: {
      apiRoot: config.telegram.apiRoot,
      ...(proxyAgent ? { agent: proxyAgent } : {}),
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

    const parsedCommand = parseMmkCommand(text, ctx.botInfo.username)
    if (parsedCommand.kind !== 'not_mmk') {
      if (ctx.chat.type !== 'private') return
      if (parsedCommand.kind === 'invalid') {
        await ctx.reply(MMK_HELP_TEXT)
        return
      }
      if (parsedCommand.command === 'help') {
        await ctx.reply(MMK_HELP_TEXT)
        return
      }
      if (!requestRestart) {
        await ctx.reply('✗ restart_unavailable')
        return
      }
      const restartResult = await requestRestart('telegram_mmk_restart')
      if (restartResult === 'busy') {
        await ctx.reply('✗ restart_busy')
        return
      }
      if (restartResult === 'already_scheduled') {
        await ctx.reply('✓ restart_already_scheduled')
        return
      }
      await ctx.reply('✓ restart_scheduled')
      return
    }

    await addUserInput(text, buildTelegramUserMeta(ctx))
  })

  bot.on('photo', async (ctx) => {
    const { caption } = ctx.message as { caption?: unknown }
    await addUserInput(
      await buildUnsupportedImageInputText({
        promptPath: 'manager/telegram-image-unsupported-input.md',
        fieldName: 'caption',
        fieldValue: caption,
      }),
      buildTelegramUserMeta(ctx),
    )
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
