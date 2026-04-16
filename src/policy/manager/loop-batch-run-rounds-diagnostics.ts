import { appendLog } from '../../persistence/log/append.js'

import { buildCorrectionFallbackReply } from './loop-batch-correction-reply.js'
import { buildClarifiedStopResult } from './loop-batch-run-helpers.js'

import type {
  ManagerActionFeedback,
  TokenUsage,
} from '../../foundation/types/index.js'
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
  actionFeedback: ManagerActionFeedback[]
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

export const buildCorrectionRoundResult = async (params: {
  runtime: ManagerRuntime
  batchId: string
  round: number
  actionFeedback: ManagerActionFeedback[]
  elapsedMs: number
  diagnostics: ManagerRoundDiagnostics
  usage?: TokenUsage
  threadId?: string
}): Promise<ReturnType<typeof buildClarifiedStopResult>> => {
  const fallbackReply = buildCorrectionFallbackReply(params.actionFeedback)
  await appendLog(params.runtime.paths.log, {
    event: 'manager_correction_structured_clarify',
    ...buildManagerCorrectionLogPayload(params),
  })
  return buildClarifiedStopResult({
    text: fallbackReply,
    elapsedMs: params.elapsedMs,
    diagnostics: params.diagnostics,
    ...(params.usage ? { usage: params.usage } : {}),
  })
}
