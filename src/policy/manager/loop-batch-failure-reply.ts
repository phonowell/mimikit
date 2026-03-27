import { appendManagerFallbackReply } from '../../persistence/history/manager-events.js'
import { bestEffort, safeOrUndefined } from '../../persistence/log/safe.js'
import { dispatchTelegramPassiveReply } from '../../surface/channels/telegram/passive-reply.js'

import type { ManagerAutoRetryMeta } from './manager-llm-call.js'
import type { UserInput } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const resolveLatestUserInputId = (inputs: UserInput[]): string | undefined => {
  for (let index = inputs.length - 1; index >= 0; index -= 1) {
    const input = inputs[index]
    if (input?.role !== 'user') continue
    return input.id
  }
  return undefined
}

export const appendAndDispatchManagerFailureReply = async (params: {
  runtime: ManagerRuntime
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
}
