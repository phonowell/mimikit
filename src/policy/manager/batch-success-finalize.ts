import { appendLog } from '../../persistence/log/append.js'
import { requestMemoryRefresh } from '../memory/refresh/singleflight.js'

import { finalizeBatchProgress } from './loop-helpers.js'
import { flushPendingManagerRestart } from './restart-runtime.js'
import { clearResultReplayBackoff } from './result-replay-backoff.js'

import type { TokenUsage } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const completeSuccessfulManagerBatch = async (params: {
  runtime: ManagerRuntime
  nextInputsCursor: number
  nextResultsCursor: number
  consumedInputIds: Set<string>
  persistRuntime: (runtime: ManagerRuntime) => Promise<void>
  startedAt: number
  usage?: TokenUsage
  skippedReason?: string
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
    status: 'ok',
    elapsedMs: Math.max(0, Date.now() - params.startedAt),
    ...(params.usage ? { usage: params.usage } : {}),
    ...(params.skippedReason ? { skippedReason: params.skippedReason } : {}),
  })
  if (flushPendingManagerRestart(params.runtime)) return
  requestMemoryRefresh(params.runtime)
}
