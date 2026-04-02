import { readProviderErrorCode } from '../../execution/providers/provider-error.js'
import { waitForManagerLoopSignal } from '../../kernel/orchestrator/signals.js'
import { appendLog } from '../../persistence/log/append.js'
import { bestEffort } from '../../persistence/log/safe.js'

import { resolveManagerIdleTimeoutMs } from './loop-idle-timeout.js'

import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const MIN_RESULT_REPLAY_BACKOFF_MS = 5_000
const MAX_RESULT_REPLAY_BACKOFF_MS = 60_000

const resolveReplayBackoffBaseMs = (runtime: ManagerRuntime): number =>
  Math.max(MIN_RESULT_REPLAY_BACKOFF_MS, runtime.config.worker.retry.backoffMs)

export const clearResultReplayBackoff = (runtime: ManagerRuntime): void => {
  runtime.process.manager.resultReplayFailureCount = 0
  runtime.process.manager.resultReplayReadyAtMs = 0
}

export const scheduleResultReplayBackoff = (params: {
  runtime: ManagerRuntime
  error: unknown
  resultsCount: number
  autoRetryState?: 'exhausted' | 'not_retryable'
}): number | undefined => {
  if (params.resultsCount === 0) {
    clearResultReplayBackoff(params.runtime)
    return undefined
  }
  if (
    params.autoRetryState !== 'exhausted' &&
    readProviderErrorCode(params.error) !== 'provider_transient_network'
  )
    return undefined
  const nextFailureCount =
    params.runtime.process.manager.resultReplayFailureCount + 1
  const delayMs = Math.min(
    MAX_RESULT_REPLAY_BACKOFF_MS,
    resolveReplayBackoffBaseMs(params.runtime) * 2 ** (nextFailureCount - 1),
  )
  params.runtime.process.manager.resultReplayFailureCount = nextFailureCount
  params.runtime.process.manager.resultReplayReadyAtMs = Date.now() + delayMs
  return delayMs
}

export const resolveResultReplayDelayMs = (
  runtime: ManagerRuntime,
  inputCount: number,
  resultCount: number,
): number => {
  if (resultCount === 0) {
    clearResultReplayBackoff(runtime)
    return 0
  }
  if (inputCount > 0) return 0
  return Math.max(0, runtime.process.manager.resultReplayReadyAtMs - Date.now())
}

export const waitForResultReplayBackoff = async (
  runtime: ManagerRuntime,
  inputCount: number,
  resultCount: number,
): Promise<boolean> => {
  const delayMs = resolveResultReplayDelayMs(runtime, inputCount, resultCount)
  if (delayMs <= 0) return false
  await bestEffort('appendLog: manager_result_replay_deferred', () =>
    appendLog(runtime.paths.log, {
      event: 'manager_result_replay_deferred',
      delayMs,
      resultsCount: resultCount,
    }),
  )
  await waitForManagerLoopSignal(
    runtime,
    Math.min(resolveManagerIdleTimeoutMs(runtime), delayMs),
  )
  return true
}
