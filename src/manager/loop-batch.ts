import { appendLog } from '../log/append.js'
import { bestEffort, logSafeError } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/ui-signal.js'
import { nowIso } from '../shared/utils.js'
import { appendHistory } from '../storage/history-jsonl.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
import {
  appendConsumedInputsToHistory,
  appendConsumedResultsToHistory,
  appendManagerFallbackReply,
} from './history.js'
import { runManagerBatch } from './loop-batch-run-manager.js'
import {
  buildFallbackReply,
  drainBatchOnFailure,
  finalizeBatchProgress,
} from './loop-helpers.js'
import { startUiStream, stopUiStream } from './loop-ui-stream.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, TokenUsage, UserInput } from '../types/index.js'
export const processManagerBatch = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
  nextWakesCursor: number
  streamId: string
}): Promise<void> => {
  const {
    runtime,
    inputs,
    results,
    nextInputsCursor,
    nextResultsCursor,
    nextWakesCursor,
    streamId,
  } = params
  runtime.managerRunning = true
  notifyUiSignal(runtime)
  const startedAt = Date.now()
  let assistantAppended = false
  startUiStream(runtime, streamId)
  try {
    const managerRun = await runManagerBatch({
      runtime,
      inputs,
      results,
      streamId,
    })
    const resolvedUsage: TokenUsage | undefined = managerRun.usage
    const { parsed } = managerRun
    const summaries = collectTaskResultSummaries(parsed.actions)
    const hasManualCanceledResult = results.some(
      (result) =>
        result.status === 'canceled' && result.cancel?.source === 'user',
    )
    const consumedInputCount = await appendConsumedInputsToHistory(
      runtime.paths.history,
      inputs,
    )
    if (consumedInputCount < inputs.length)
      throw new Error('append_consumed_inputs_incomplete')

    const consumedResultCount = await appendConsumedResultsToHistory(
      runtime.paths.history,
      runtime.tasks,
      results,
      summaries,
    )
    if (consumedResultCount < results.length)
      throw new Error('append_consumed_results_incomplete')
    await applyTaskActions(runtime, parsed.actions, {
      suppressCreateTask: hasManualCanceledResult && inputs.length === 0,
    })

    const responseText =
      parsed.text.trim() ||
      (await buildFallbackReply({
        inputs,
        results,
      }))
    await appendHistory(runtime.paths.history, {
      id: `assistant-${Date.now()}-${nextInputsCursor}`,
      role: 'assistant',
      text: responseText,
      createdAt: nowIso(),
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
      ...(managerRun.elapsedMs >= 0 ? { elapsedMs: managerRun.elapsedMs } : {}),
    })
    assistantAppended = true

    await finalizeBatchProgress({
      runtime,
      nextInputsCursor,
      nextResultsCursor,
      nextWakesCursor,
      consumedInputIds: new Set(inputs.map((item) => item.id)),
      persistRuntime: persistRuntimeState,
    })

    await appendLog(runtime.paths.log, {
      event: 'manager_end',
      status: 'ok',
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
    })
  } catch (error) {
    let drainedOnError = false
    try {
      drainedOnError = await drainBatchOnFailure({
        runtime,
        inputs,
        results,
        nextInputsCursor,
        nextResultsCursor,
        nextWakesCursor,
        persistRuntime: persistRuntimeState,
      })
    } catch (drainError) {
      await logSafeError('managerLoop: drainBatchOnFailure', drainError)
    }

    if (drainedOnError && !assistantAppended && inputs.length > 0) {
      await bestEffort('appendHistory: manager_fallback_reply', () =>
        appendManagerFallbackReply(runtime.paths),
      )
    }

    await bestEffort('appendLog: manager_end_error', () =>
      appendLog(runtime.paths.log, {
        event: 'manager_end',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Math.max(0, Date.now() - startedAt),
        drainedOnError,
        assistantAppended,
      }),
    )
    await bestEffort('persistRuntimeState: manager_error', () =>
      persistRuntimeState(runtime),
    )
  } finally {
    stopUiStream(runtime, streamId)
    runtime.managerRunning = false
    notifyUiSignal(runtime)
  }
}
