import {
  logChannelBroadcastFailed,
  logChannelBroadcastSent,
  logChannelBroadcastSkipped,
} from './channel-broadcast-log.js'
import { sendTelegramChannelText } from './channel-delivery.js'

import type { RuntimeState, UserMeta } from './runtime-state.js'
import type { UserInput } from '../../foundation/types/index.js'

type BroadcastKind = 'user_message' | 'agent_reply'
type ChannelSource = 'telegram'
type ChannelSpec = {
  source: ChannelSource
  enabled: (runtime: RuntimeState) => boolean
  resolveTargetId: (runtime: RuntimeState) => string
  send: (
    runtime: RuntimeState,
    text: string,
  ) => Promise<{ messageId?: string | undefined }>
}

const trimOrEmpty = (value: string | undefined): string => value?.trim() ?? ''

const CHANNEL_SPECS: ChannelSpec[] = [
  {
    source: 'telegram',
    enabled: (runtime) => runtime.config.telegram.enabled,
    resolveTargetId: (runtime) =>
      trimOrEmpty(runtime.session.channelTargets.telegramChatId) ||
      runtime.config.telegram.chatId.trim(),
    send: (runtime, text) =>
      sendTelegramChannelText({
        botToken: runtime.config.telegram.botToken,
        apiRoot: runtime.config.telegram.apiRoot,
        proxy: runtime.config.telegram.proxy,
        chatId:
          trimOrEmpty(runtime.session.channelTargets.telegramChatId) ||
          runtime.config.telegram.chatId.trim(),
        text,
      }),
  },
]

const dispatchChannelBroadcast = async (params: {
  runtime: RuntimeState
  spec: ChannelSpec
  kind: BroadcastKind
  text: string
  sourceMessageId: string
  originSource?: string
}): Promise<void> => {
  if (!params.spec.enabled(params.runtime)) return
  if (
    params.kind === 'user_message' &&
    params.originSource === params.spec.source
  )
    return

  const content = params.text.trim()
  if (!content) return

  const targetId = params.spec.resolveTargetId(params.runtime)
  if (!targetId) {
    await logChannelBroadcastSkipped({
      runtime: params.runtime,
      kind: params.kind,
      channel: params.spec.source,
      sourceMessageId: params.sourceMessageId,
      reason: 'missing_target_id',
    })
    return
  }

  try {
    const sent = await params.spec.send(params.runtime, content)
    await logChannelBroadcastSent({
      runtime: params.runtime,
      kind: params.kind,
      channel: params.spec.source,
      sourceMessageId: params.sourceMessageId,
      targetId,
      ...(sent.messageId ? { sentMessageId: sent.messageId } : {}),
    })
  } catch (error) {
    await logChannelBroadcastFailed({
      runtime: params.runtime,
      kind: params.kind,
      channel: params.spec.source,
      sourceMessageId: params.sourceMessageId,
      targetId,
      error,
    })
  }
}

export const rememberChannelTargets = (
  runtime: RuntimeState,
  meta?: UserMeta,
): void => {
  const telegramChatId = trimOrEmpty(meta?.telegramChatId)
  if (telegramChatId)
    runtime.session.channelTargets.telegramChatId = telegramChatId
}

export const broadcastUserMessage = async (params: {
  runtime: RuntimeState
  input: UserInput
}): Promise<void> => {
  if (params.input.role !== 'user') return
  const originSource = trimOrEmpty(params.input.source)
  await Promise.all(
    CHANNEL_SPECS.map((spec) =>
      dispatchChannelBroadcast({
        runtime: params.runtime,
        spec,
        kind: 'user_message',
        text: params.input.text,
        sourceMessageId: params.input.id,
        ...(originSource ? { originSource } : {}),
      }),
    ),
  )
}

export const broadcastAgentReply = async (params: {
  runtime: RuntimeState
  messageId: string
  text: string
}): Promise<void> => {
  await Promise.all(
    CHANNEL_SPECS.map((spec) =>
      dispatchChannelBroadcast({
        runtime: params.runtime,
        spec,
        kind: 'agent_reply',
        text: params.text,
        sourceMessageId: params.messageId,
      }),
    ),
  )
}
