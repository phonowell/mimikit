import { dispatchFeishuPassiveReply } from '../channels/feishu/passive-reply.js'
import { dispatchTelegramPassiveReply } from '../channels/telegram/passive-reply.js'
import { appendManagerFallbackReply } from '../history/manager-events.js'
import { bestEffort, safeOrUndefined } from '../log/safe.js'

import type { ManagerAutoRetryMeta } from './manager-llm-call.js'
import type { RuntimeState } from './runtime-adapter.js'
import type { UserInput } from '../types/index.js'

const resolveLatestUserInputId = (inputs: UserInput[]): string | undefined => {
  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const input = inputs[index]
    if (input?.role !== 'user') continue
    return input.id
  }
  return undefined
}

export const appendAndDispatchManagerFailureReply = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  focusId: string
  autoRetryMeta: ManagerAutoRetryMeta
}): Promise<void> => {
  const sourceInputId = resolveLatestUserInputId(params.inputs)
  const fallbackReplyText = await safeOrUndefined(
    'appendHistory: manager_fallback_reply',
    () =>
      appendManagerFallbackReply(params.runtime.paths, params.focusId, {
        ...(sourceInputId ? { sourceInputId } : {}),
        autoRetryAttempts: params.autoRetryMeta.autoRetryAttempts,
        autoRetryMaxAttempts: params.autoRetryMeta.autoRetryMaxAttempts,
        autoRetryState: params.autoRetryMeta.autoRetryState,
        autoRetryStrategy: params.autoRetryMeta.autoRetryStrategy,
      }),
  )
  if (!fallbackReplyText) return
  await bestEffort('telegram:dispatch_passive_reply_fallback', () =>
    dispatchTelegramPassiveReply({
      runtime: params.runtime,
      inputs: params.inputs,
      replyText: fallbackReplyText,
    }),
  )
  await bestEffort('feishu:dispatch_passive_reply_fallback', () =>
    dispatchFeishuPassiveReply({
      runtime: params.runtime,
      inputs: params.inputs,
      replyText: fallbackReplyText,
    }),
  )
}
