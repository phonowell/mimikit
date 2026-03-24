import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import type { RuntimeState } from './runtime-state.js'

type BroadcastKind = 'user_message' | 'agent_reply'
type ChannelSource = 'telegram' | 'feishu'

export const logChannelBroadcastSkipped = (params: {
  runtime: RuntimeState
  kind: BroadcastKind
  channel: ChannelSource
  sourceMessageId: string
  reason: string
}): Promise<void> =>
  bestEffort('channel_broadcast_skipped', () =>
    appendLog(params.runtime.paths.log, {
      event: 'channel_broadcast_skipped',
      kind: params.kind,
      channel: params.channel,
      messageId: params.sourceMessageId,
      reason: params.reason,
    }),
  )

export const logChannelBroadcastSent = (params: {
  runtime: RuntimeState
  kind: BroadcastKind
  channel: ChannelSource
  sourceMessageId: string
  targetId: string
  sentMessageId?: string
}): Promise<void> =>
  bestEffort('channel_broadcast_sent', () =>
    appendLog(params.runtime.paths.log, {
      event: 'channel_broadcast_sent',
      kind: params.kind,
      channel: params.channel,
      messageId: params.sourceMessageId,
      targetId: params.targetId,
      ...(params.sentMessageId
        ? { channelMessageId: params.sentMessageId }
        : {}),
    }),
  )

export const logChannelBroadcastFailed = async (params: {
  runtime: RuntimeState
  kind: BroadcastKind
  channel: ChannelSource
  sourceMessageId: string
  targetId?: string
  error: unknown
}): Promise<void> => {
  const message =
    params.error instanceof Error ? params.error.message : String(params.error)
  await bestEffort('channel_broadcast_failed', () =>
    appendLog(params.runtime.paths.log, {
      event: 'channel_broadcast_failed',
      kind: params.kind,
      channel: params.channel,
      messageId: params.sourceMessageId,
      ...(params.targetId ? { targetId: params.targetId } : {}),
      error: message,
    }),
  )
}
