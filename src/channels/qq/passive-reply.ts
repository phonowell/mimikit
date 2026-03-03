import { appendLog } from '../../log/append.js'
import { parseIsoMs } from '../../shared/time.js'

import { sendQqPassiveTextReply } from './client.js'
import { reserveQqReplySeq } from './state.js'

import type { RuntimeState } from '../../manager/runtime-adapter.js'
import type { UserInput } from '../../types/index.js'

const QQ_PASSIVE_WINDOW_MS = 60 * 60 * 1000
const QQ_MAX_REPLY_PER_MESSAGE = 5

type QqUserInput = Extract<UserInput, { role: 'user' }> & {
  source: 'qq'
  qqOpenid: string
  qqMessageId: string
  qqEventId?: string
  qqTimestamp?: string
}

const isQqUserInput = (input: UserInput): input is QqUserInput => {
  return Boolean(
    input.role === 'user' &&
      input.source === 'qq' &&
      input.qqOpenid?.trim() &&
      input.qqMessageId?.trim(),
  )
}

const resolveLatestQqInput = (inputs: UserInput[]): QqUserInput | undefined => {
  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const item = inputs[index]
    if (item && isQqUserInput(item)) return item
  }
  return undefined
}

const isPassiveWindowExpired = (qqTimestamp?: string): boolean => {
  const ts = qqTimestamp ? parseIsoMs(qqTimestamp) : undefined
  if (ts === undefined) return false
  return Date.now() - ts > QQ_PASSIVE_WINDOW_MS
}

export const hasQqUserInput = (inputs: UserInput[]): boolean =>
  inputs.some((item) => isQqUserInput(item))

export const dispatchQqPassiveReply = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  replyText: string
}): Promise<void> => {
  const { runtime, inputs } = params
  if (!runtime.config.qq.enabled) return
  const qqInput = resolveLatestQqInput(inputs)
  if (!qqInput) return

  const content = params.replyText.trim()
  if (!content) return

  if (isPassiveWindowExpired(qqInput.qqTimestamp)) {
    await appendLog(runtime.paths.log, {
      event: 'qq_reply_skipped',
      reason: 'passive_window_expired',
      inputId: qqInput.id,
      msgId: qqInput.qqMessageId,
      eventId: qqInput.qqEventId,
    })
    return
  }

  const reserved = await reserveQqReplySeq({
    stateDir: runtime.config.workDir,
    messageId: qqInput.qqMessageId,
    maxReplies: QQ_MAX_REPLY_PER_MESSAGE,
  })
  if (!reserved.ok) {
    await appendLog(runtime.paths.log, {
      event: 'qq_reply_skipped',
      reason: reserved.reason,
      inputId: qqInput.id,
      msgId: qqInput.qqMessageId,
      eventId: qqInput.qqEventId,
    })
    return
  }

  const sent = await sendQqPassiveTextReply({
    appId: runtime.config.qq.appId,
    appSecret: runtime.config.qq.appSecret,
    apiBase: runtime.config.qq.apiBase,
    openid: qqInput.qqOpenid,
    text: content,
    ...(qqInput.qqMessageId ? { msgId: qqInput.qqMessageId } : {}),
    ...(qqInput.qqEventId ? { eventId: qqInput.qqEventId } : {}),
    msgSeq: reserved.msgSeq,
  })
  await appendLog(runtime.paths.log, {
    event: 'qq_reply_sent',
    inputId: qqInput.id,
    msgId: qqInput.qqMessageId,
    eventId: qqInput.qqEventId,
    msgSeq: reserved.msgSeq,
    ...(sent.messageId ? { qqReplyMessageId: sent.messageId } : {}),
  })
}
