import { appendLog } from '../../persistence/log/append.js'

import {
  buildCorrectionFallbackReply,
  shouldRetrySelfRepairRound,
} from './loop-batch-correction-reply.js'
import { buildRoundLimitResult } from './loop-batch-run-helpers.js'

import type { ManagerRoundExtra } from './loop-batch-run-helpers.js'
import type { TokenUsage } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export type ManagerRoundDiagnostics = {
  batchId: string
  roundCount: number
  roundId?: string
  providerCallId?: string
  traceRef?: string
  threadId?: string
}

export const updateManagerRoundDiagnostics = (params: {
  batchId: string
  round: number
  threadId?: string
  runResult: {
    roundId: string
    providerCallId?: string
    traceRef?: string
  }
}): ManagerRoundDiagnostics => ({
  batchId: params.batchId,
  roundCount: params.round,
  roundId: params.runResult.roundId,
  ...(params.runResult.providerCallId
    ? { providerCallId: params.runResult.providerCallId }
    : {}),
  ...(params.runResult.traceRef ? { traceRef: params.runResult.traceRef } : {}),
  ...(params.threadId ? { threadId: params.threadId } : {}),
})

const buildManagerCorrectionLogPayload = (params: {
  batchId: string
  round: number
  actionFeedback: NonNullable<ManagerRoundExtra['actionFeedback']>
  diagnostics: ManagerRoundDiagnostics
  threadId?: string
}): {
  traceId?: string
  batchId: string
  roundId?: string
  round: number
  feedbackCount: number
  errors: string[]
  names: string[]
} => ({
  ...(params.threadId ? { traceId: params.threadId } : {}),
  batchId: params.batchId,
  ...(params.diagnostics.roundId
    ? { roundId: params.diagnostics.roundId }
    : {}),
  round: params.round,
  feedbackCount: params.actionFeedback.length,
  errors: params.actionFeedback.map((item) => item.error),
  names: params.actionFeedback.map((item) => item.action),
})

export const resolveSelfRepairRoundContinuation = async (params: {
  runtime: ManagerRuntime
  batchId: string
  round: number
  actionFeedback: NonNullable<ManagerRoundExtra['actionFeedback']>
  elapsedMs: number
  diagnostics: ManagerRoundDiagnostics
  usage?: TokenUsage
  threadId?: string
}): Promise<
  | {
      continueRound: true
    }
  | ReturnType<typeof buildRoundLimitResult>
> => {
  if (!shouldRetrySelfRepairRound(params.round, params.actionFeedback)) {
    const fallbackReply = buildCorrectionFallbackReply(params.actionFeedback)
    await appendLog(params.runtime.paths.log, {
      event: 'manager_correction_structured_clarify',
      ...buildManagerCorrectionLogPayload(params),
    })
    return buildRoundLimitResult({
      text: fallbackReply,
      elapsedMs: params.elapsedMs,
      diagnostics: params.diagnostics,
      ...(params.usage ? { usage: params.usage } : {}),
    })
  }

  await appendLog(params.runtime.paths.log, {
    event: 'manager_action_feedback_self_repair_retry',
    ...buildManagerCorrectionLogPayload(params),
  })
  return { continueRound: true }
}

export const appendManagerCorrectionRoundLimitReached = (
  runtime: ManagerRuntime,
  params: {
    maxCorrectionRounds: number
    batchId: string
    diagnostics: ManagerRoundDiagnostics
    threadId?: string
  },
): Promise<void> =>
  appendLog(runtime.paths.log, {
    event: 'manager_correction_round_limit_reached',
    ...(params.threadId ? { traceId: params.threadId } : {}),
    batchId: params.batchId,
    ...(params.diagnostics.roundId
      ? { roundId: params.diagnostics.roundId }
      : {}),
    maxCorrectionRounds: params.maxCorrectionRounds,
  })
