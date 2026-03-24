import { appendLog } from '../../../persistence/log/append.js'

import type { UserInput } from '../../../foundation/types/index.js'
import type { RuntimeState } from '../../../kernel/orchestrator/runtime-state.js'

type DispatchParams<TInput extends UserInput> = {
  runtime: RuntimeState
  inputs: UserInput[]
  replyText: string
  enabled: boolean
  sourceLabel: string
  missingTargetReason?: string
  resolveLatestInput: (inputs: UserInput[]) => TInput | undefined
  resolveTargetId: (input: TInput) => string
  buildMissingTargetLog: (input: TInput) => Record<string, unknown>
  sendMessage: (params: {
    targetId: string
    text: string
  }) => Promise<{ messageId?: string }>
  buildSentLog: (params: {
    input: TInput
    targetId: string
    sentMessageId?: string
  }) => Record<string, unknown>
}

export const dispatchChannelPassiveReply = async <TInput extends UserInput>(
  params: DispatchParams<TInput>,
): Promise<void> => {
  if (!params.enabled) return

  const input = params.resolveLatestInput(params.inputs)
  if (!input) return

  const content = params.replyText.trim()
  if (!content) return

  const targetId = params.resolveTargetId(input)
  if (!targetId) {
    await appendLog(params.runtime.paths.log, {
      event: `${params.sourceLabel}_reply_skipped`,
      reason: params.missingTargetReason ?? 'missing_target_id',
      ...params.buildMissingTargetLog(input),
    })
    return
  }

  const sent = await params.sendMessage({ targetId, text: content })
  await appendLog(params.runtime.paths.log, {
    event: `${params.sourceLabel}_reply_sent`,
    ...params.buildSentLog({
      input,
      targetId,
      ...(sent.messageId ? { sentMessageId: sent.messageId } : {}),
    }),
  })
}
