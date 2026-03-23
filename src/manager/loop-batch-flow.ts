import { resolveDefaultFocusId, touchFocus } from '../focus/index.js'
import { appendManagerErrorSystemMessage } from '../history/manager-events.js'
import { appendHistory } from '../history/store.js'
import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError } from '../log/safe.js'
import { broadcastAgentReply } from '../orchestrator/core/channel-broadcast.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { nowIso } from '../shared/utils.js'

import { appendAndDispatchManagerFailureReply } from './loop-batch-failure-reply.js'
import {
  consumeBatchHistory,
  consumeBatchInputsHistory,
  finalizeBatchProgress,
} from './loop-helpers.js'
import { readManagerAutoRetryMeta } from './manager-llm-call.js'
import { scheduleResultReplayBackoff } from './result-replay-backoff.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, TokenUsage, UserInput } from '../types/index.js'

export const finishBatchWithoutAgentReply = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
  startedAt: number
}): Promise<void> => {
  const consumed = await consumeBatchHistory({
    runtime: params.runtime,
    inputs: params.inputs,
    results: params.results,
  })
  if (!consumed.ok) throw new Error(consumed.reason)
  await finalizeBatchProgress({
    runtime: params.runtime,
    nextInputsCursor: params.nextInputsCursor,
    nextResultsCursor: params.nextResultsCursor,
    consumedInputIds: consumed.consumedInputIds,
    persistRuntime: persistRuntimeState,
  })
  await appendLog(params.runtime.paths.log, {
    event: 'manager_end',
    status: 'ok',
    elapsedMs: Math.max(0, Date.now() - params.startedAt),
    skippedReason: 'no_agent_visible_inputs',
  })
}

export const appendManagerReply = async (params: {
  runtime: RuntimeState
  text: string
  nextInputsCursor: number
  usage?: TokenUsage
  elapsedMs?: number
}): Promise<void> => {
  const replyFocusId = resolveDefaultFocusId(params.runtime)
  touchFocus(params.runtime, replyFocusId)
  const messageId = `agent-${Date.now()}-${params.nextInputsCursor}`
  await appendHistory(params.runtime.paths.history, {
    id: messageId,
    role: 'agent',
    text: params.text,
    createdAt: nowIso(),
    focusId: replyFocusId,
    ...(params.usage ? { usage: params.usage } : {}),
    ...(params.elapsedMs !== undefined && params.elapsedMs >= 0
      ? { elapsedMs: params.elapsedMs }
      : {}),
  })
  await bestEffort('broadcast:agent_reply', () =>
    broadcastAgentReply({
      runtime: params.runtime,
      messageId,
      text: params.text,
    }),
  )
}

export const recoverManagerBatchFailure = async (params: {
  runtime: RuntimeState
  error: unknown
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
  agentInputsCount: number
  agentAppended: boolean
  startedAt: number
}): Promise<void> => {
  const errorMessage =
    params.error instanceof Error ? params.error.message : String(params.error)
  const autoRetryMeta = readManagerAutoRetryMeta(params.error)
  const fallbackAutoRetryMeta = {
    autoRetryAttempts: autoRetryMeta?.autoRetryAttempts ?? 0,
    autoRetryMaxAttempts:
      autoRetryMeta?.autoRetryMaxAttempts ??
      Math.max(0, params.runtime.config.worker.retry.maxAttempts),
    autoRetryState: autoRetryMeta?.autoRetryState ?? ('not_retryable' as const),
    autoRetryStrategy:
      autoRetryMeta?.autoRetryStrategy ?? 'reuse_worker_retry_config',
  }
  const resultReplayBackoffMs = scheduleResultReplayBackoff({
    runtime: params.runtime,
    error: params.error,
    resultsCount: params.results.length,
    autoRetryState: fallbackAutoRetryMeta.autoRetryState,
  })
  let inputsDrainedOnError = false
  try {
    const consumedInputs = await consumeBatchInputsHistory({
      runtime: params.runtime,
      inputs: params.inputs,
    })
    if (consumedInputs.ok) {
      await finalizeBatchProgress({
        runtime: params.runtime,
        nextInputsCursor: params.nextInputsCursor,
        nextResultsCursor: params.runtime.queues.resultsCursor,
        consumedInputIds: consumedInputs.consumedInputIds,
        persistRuntime: persistRuntimeState,
      })
      inputsDrainedOnError = true
    }
  } catch (drainError) {
    await logSafeError('managerLoop: drain input batch on failure', drainError)
  }
  const errorFocusId = resolveDefaultFocusId(params.runtime)
  if (
    inputsDrainedOnError &&
    !params.agentAppended &&
    params.agentInputsCount > 0
  ) {
    await appendAndDispatchManagerFailureReply({
      runtime: params.runtime,
      inputs: params.inputs,
      focusId: errorFocusId,
      autoRetryMeta: fallbackAutoRetryMeta,
    })
  }
  await bestEffort('appendHistory: manager_error_system_message', () =>
    appendManagerErrorSystemMessage(
      params.runtime.paths,
      errorMessage,
      errorFocusId,
    ),
  )
  await bestEffort('appendLog: manager_end_error', () =>
    appendLog(params.runtime.paths.log, {
      event: 'manager_end',
      status: 'error',
      error: errorMessage,
      elapsedMs: Math.max(0, Date.now() - params.startedAt),
      drainedOnError: inputsDrainedOnError,
      agentAppended: params.agentAppended,
      autoRetryAttempts: fallbackAutoRetryMeta.autoRetryAttempts,
      autoRetryMaxAttempts: fallbackAutoRetryMeta.autoRetryMaxAttempts,
      autoRetryState: fallbackAutoRetryMeta.autoRetryState,
      autoRetryStrategy: fallbackAutoRetryMeta.autoRetryStrategy,
      ...(resultReplayBackoffMs !== undefined ? { resultReplayBackoffMs } : {}),
    }),
  )
  await bestEffort('persistRuntimeState: manager_error', () =>
    persistRuntimeState(params.runtime),
  )
}
