import { appendLog } from '../../persistence/log/append.js'
import { requestMemoryRefresh } from '../memory/refresh/singleflight.js'

import { finalizeBatchProgress } from './loop-helpers.js'
import { flushPendingManagerRestart } from './restart-runtime.js'
import { clearResultReplayBackoff } from './result-replay-backoff.js'

import type { TokenUsage } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const completeSuccessfulManagerBatch = async (params: {
  runtime: ManagerRuntime
  batchId: string
  nextInputsCursor: number
  nextResultsCursor: number
  consumedInputIds: Set<string>
  persistRuntime: (runtime: ManagerRuntime) => Promise<void>
  startedAt: number
  usage?: TokenUsage
  skippedReason?: string
  diagnostics?: {
    roundCount: number
    roundId?: string
    providerCallId?: string
    traceRef?: string
    threadId?: string
  }
}): Promise<void> => {
  await finalizeBatchProgress({
    runtime: params.runtime,
    nextInputsCursor: params.nextInputsCursor,
    nextResultsCursor: params.nextResultsCursor,
    consumedInputIds: params.consumedInputIds,
    persistRuntime: params.persistRuntime,
  })
  clearResultReplayBackoff(params.runtime)
  await appendLog(params.runtime.paths.log, {
    event: 'manager_end',
    batchId: params.batchId,
    status: 'ok',
    elapsedMs: Math.max(0, Date.now() - params.startedAt),
    ...(params.diagnostics?.roundId
      ? { roundId: params.diagnostics.roundId }
      : {}),
    ...(params.diagnostics?.providerCallId
      ? { providerCallId: params.diagnostics.providerCallId }
      : {}),
    ...(params.diagnostics?.traceRef
      ? { traceRef: params.diagnostics.traceRef }
      : {}),
    ...(params.diagnostics?.threadId
      ? { threadId: params.diagnostics.threadId }
      : {}),
    ...(typeof params.diagnostics?.roundCount === 'number'
      ? { roundCount: params.diagnostics.roundCount }
      : {}),
    ...(params.usage ? { usage: params.usage } : {}),
    ...(params.skippedReason ? { skippedReason: params.skippedReason } : {}),
  })
  if (flushPendingManagerRestart(params.runtime)) return
  requestMemoryRefresh(params.runtime)
}
