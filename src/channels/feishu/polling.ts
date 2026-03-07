import { EventDispatcher, WSClient } from '@larksuiteoapi/node-sdk'

import { appendLog } from '../../log/append.js'

import { assertEnabledFeishuConfig } from './config.js'
import {
  type FeishuInboundEvent,
  resolveImageFallbackText,
  resolveReplyTargetChatId,
  resolveTextFromMessage,
  shouldIgnoreMessage,
  toIsoFromUnixMillis,
} from './events.js'
import { buildUnsupportedImageInputText } from './image-unsupported-input.js'

import type { AppConfig } from '../../config.js'
import type { UserMeta } from '../../orchestrator/core/runtime-state.js'

type FeishuRunner = {
  wsClient: WSClient
}
const runners = new Map<string, FeishuRunner>()

const buildFeishuUserMeta = (event: FeishuInboundEvent): UserMeta => ({
  source: 'feishu',
  platform: 'feishu',
  channel: 'feishu',
  ...(event.message?.chat_id ? { feishuChatId: event.message.chat_id } : {}),
  ...(event.message?.message_id
    ? { feishuMessageId: event.message.message_id }
    : {}),
  ...(event.event_id ? { feishuEventId: event.event_id } : {}),
  ...(() => {
    const timestamp =
      toIsoFromUnixMillis(event.message?.create_time) ??
      toIsoFromUnixMillis(event.create_time)
    return timestamp ? { feishuTimestamp: timestamp } : {}
  })(),
})

export const startFeishuPolling = async (params: {
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
  if (!config.feishu.enabled) return
  if (runners.has(workDir)) return

  assertEnabledFeishuConfig(config.feishu)

  const wsClient = new WSClient({
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
    autoReconnect: true,
  })

  const dispatcher = new EventDispatcher({})
  dispatcher.register({
    'im.message.receive_v1': async (event: FeishuInboundEvent) => {
      if (shouldIgnoreMessage(event)) return
      const messageType = event.message?.message_type?.trim().toLowerCase()
      const targetChatId = resolveReplyTargetChatId(config.feishu.chatId, event)
      const meta = {
        ...buildFeishuUserMeta(event),
        ...(targetChatId ? { feishuChatId: targetChatId } : {}),
      }

      if (messageType === 'text') {
        const text = resolveTextFromMessage(event)
        if (!text) return
        if (!targetChatId) return
        await addUserInput(text, meta)
        return
      }

      const fallbackText = resolveImageFallbackText(event)
      if (!targetChatId) return
      await addUserInput(
        await buildUnsupportedImageInputText(fallbackText),
        meta,
      )
    },
  })

  try {
    await wsClient.start({ eventDispatcher: dispatcher })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`feishu_polling_start_failed:${message}`)
  }

  runners.set(workDir, { wsClient })
  await appendLog(logPath, {
    event: 'feishu_polling_started',
    workDir,
  })
}

export const stopFeishuPolling = async (params: {
  workDir: string
  logPath: string
}): Promise<void> => {
  const runner = runners.get(params.workDir)
  if (!runner) return

  runner.wsClient.close({ force: true })
  runners.delete(params.workDir)
  await appendLog(params.logPath, {
    event: 'feishu_polling_stopped',
    workDir: params.workDir,
  })
}
