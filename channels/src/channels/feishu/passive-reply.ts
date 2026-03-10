import { dispatchChannelPassiveReply } from '../shared/passive-dispatch.js'
import {
  hasUserInputFromSource,
  resolveLatestUserInputFromSource,
} from '../shared/passive-reply.js'

import type { RuntimeState } from '../../types.js'
import type { UserInput } from '../../types.js'

type FeishuUserInput = Extract<UserInput, { role: 'user' }> & {
  source: 'feishu'
  feishuChatId?: string
  feishuMessageId?: string
  feishuEventId?: string
  feishuTimestamp?: string
}

const isFeishuUserInput = (input: UserInput): input is FeishuUserInput =>
  Boolean(input.role === 'user' && input.source === 'feishu')

const resolveLatestFeishuInput = (
  inputs: UserInput[],
): FeishuUserInput | undefined => {
  const latest = resolveLatestUserInputFromSource(inputs, 'feishu')
  if (!latest || !isFeishuUserInput(latest)) return undefined
  return latest
}

export const hasFeishuUserInput = (inputs: UserInput[]): boolean =>
  hasUserInputFromSource(inputs, 'feishu')

export const dispatchFeishuPassiveReply = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  replyText: string
}): Promise<void> => {
  const { runtime } = params
  await dispatchChannelPassiveReply<FeishuUserInput>({
    runtime,
    inputs: params.inputs,
    replyText: params.replyText,
    enabled: runtime.config.feishu.enabled,
    sourceLabel: 'feishu',
    missingTargetReason: 'missing_chat_id',
    resolveLatestInput: resolveLatestFeishuInput,
    resolveTargetId: (input) =>
      input.feishuChatId?.trim() ?? runtime.config.feishu.chatId.trim(),
    buildMissingTargetLog: (input) => ({
      inputId: input.id,
      messageId: input.feishuMessageId,
      eventId: input.feishuEventId,
    }),
    sendMessage: async ({ targetId, text }) => {
      const { sendFeishuTextMessage } = await import('./client.js')
      return sendFeishuTextMessage({
        appId: runtime.config.feishu.appId,
        appSecret: runtime.config.feishu.appSecret,
        chatId: targetId,
        text,
      })
    },
    buildSentLog: ({ input, targetId, sentMessageId }) => ({
      inputId: input.id,
      chatId: targetId,
      messageId: input.feishuMessageId,
      eventId: input.feishuEventId,
      ...(sentMessageId ? { feishuReplyMessageId: sentMessageId } : {}),
    }),
  })
}
