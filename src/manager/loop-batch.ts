import { resolveDefaultFocusId } from '../focus/index.js'
import {
  appendManagerCorrectionLimitSystemMessage,
} from '../history/manager-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/signals.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
import { hasNonIdleManagerInput } from './idle-input.js'
import { applyIntentCompletionCooldown } from './loop-batch-pre.js'
import { runManagerBatch } from './loop-batch-run-manager.js'
import {
  appendManagerReply,
  finishBatchWithoutAgentReply,
  recoverManagerBatchFailure,
} from './loop-batch-flow.js'
import {
  buildFallbackReply,
  consumeBatchHistory,
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
  streamId: string
}): Promise<void> => {
  const {
    runtime,
    inputs,
    results,
    nextInputsCursor,
    nextResultsCursor,
    streamId,
  } = params
  applyIntentCompletionCooldown(runtime, results)
  if (results.length > 0 || hasNonIdleManagerInput(inputs))
    runtime.lastManagerActivityAtMs = Date.now()
  runtime.managerRunning = true
  notifyUiSignal(runtime)
  const agentInputs = inputs.filter((item) => isVisibleToAgent(item))
  const startedAt = Date.now()
  let agentAppended = false
  startUiStream(runtime, streamId)
  try {
    if (agentInputs.length === 0 && results.length === 0) {
      await finishBatchWithoutAgentReply({
        runtime,
        inputs,
        results,
        nextInputsCursor,
        nextResultsCursor,
        startedAt,
      })
      return
    }
    runtime.managerTurn += 1
    const managerRun = await runManagerBatch({
      runtime,
      inputs: agentInputs,
      results,
      streamId,
    })
    if (managerRun.roundLimitReached) {
      await bestEffort('appendHistory: manager_round_limit', () =>
        appendManagerCorrectionLimitSystemMessage(
          runtime.paths,
          runtime.config.manager.maxCorrectionRounds,
          resolveDefaultFocusId(runtime),
        ),
      )
    }
    const resolvedUsage: TokenUsage | undefined = managerRun.usage
    const { parsed } = managerRun
    const summaries = collectTaskResultSummaries(parsed.actions)
    const hasManualCanceledResult = results.some(
      (result) =>
        result.status === 'canceled' && result.cancel?.source === 'user',
    )
    const consumed = await consumeBatchHistory({
      runtime,
      inputs,
      results,
      summaries,
    })
    if (!consumed.ok) throw new Error(consumed.reason)
    await applyTaskActions(runtime, parsed.actions, {
      suppressRunTask: hasManualCanceledResult && agentInputs.length === 0,
    })

    const responseText =
      parsed.text.trim() ||
      (await buildFallbackReply({
        inputs: agentInputs,
        results,
      }))
    await appendManagerReply({
      runtime,
      text: responseText,
      nextInputsCursor,
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
      ...(managerRun.elapsedMs >= 0 ? { elapsedMs: managerRun.elapsedMs } : {}),
    })
    agentAppended = true

    await finalizeBatchProgress({
      runtime,
      nextInputsCursor,
      nextResultsCursor,
      consumedInputIds: consumed.consumedInputIds,
      persistRuntime: persistRuntimeState,
    })

    await appendLog(runtime.paths.log, {
      event: 'manager_end',
      status: 'ok',
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
    })
  } catch (error) {
    await recoverManagerBatchFailure({
      runtime,
      error,
      inputs,
      results,
      nextInputsCursor,
      nextResultsCursor,
      agentInputsCount: agentInputs.length,
      agentAppended,
      startedAt,
    })
  } finally {
    stopUiStream(runtime, streamId)
    runtime.managerRunning = false
    notifyUiSignal(runtime)
  }
}
