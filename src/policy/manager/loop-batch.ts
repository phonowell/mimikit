import { readProviderErrorCode } from '../../execution/providers/provider-error.js'
import { persistRuntimeState } from '../../kernel/orchestrator/runtime-persistence.js'
import { notifyUiSignal } from '../../kernel/orchestrator/signals.js'
import { appendManagerCorrectionLimitSystemMessage } from '../../persistence/history/manager-events.js'
import { bestEffort } from '../../persistence/log/safe.js'
import { isVisibleToAgent } from '../../surface/shared/message-visibility.js'
import { resolveDefaultFocusId } from '../../work/focus/index.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
import { completeSuccessfulManagerBatch } from './batch-success-finalize.js'
import { collectTriggeredPlanIds } from './loop-batch-context.js'
import {
  finishBatchWithoutAgentReply,
  recoverManagerBatchFailure,
} from './loop-batch-flow.js'
import { appendManagerBatchReply } from './loop-batch-reply.js'
import { runManagerBatch } from './loop-batch-run-manager.js'
import { consumeBatchHistory } from './loop-helpers.js'
import { applyPlanCompletionState } from './plan-progress.js'
import { normalizeManagerReplyText } from './reply-normalize.js'

import type {
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const processManagerBatch = async (params: {
  runtime: ManagerRuntime
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
}): Promise<void> => {
  const { runtime, inputs, results, nextInputsCursor, nextResultsCursor } =
    params
  applyPlanCompletionState(runtime, results)
  if (results.length > 0 || inputs.length > 0)
    runtime.process.manager.lastActivityAtMs = Date.now()
  runtime.process.manager.running = true
  notifyUiSignal(runtime)
  const runAbortController = new AbortController()
  runtime.process.manager.runAbortController = runAbortController
  const agentInputs = inputs.filter((item) => isVisibleToAgent(item))
  const startedAt = Date.now()
  let agentAppended = false
  let managerBatchId: string | undefined
  try {
    if (
      runtime.process.session.stopped ||
      (agentInputs.length === 0 && results.length === 0)
    ) {
      await finishBatchWithoutAgentReply({
        runtime,
        batchId: `batch-noop-${runtime.process.manager.turn + 1}`,
        inputs,
        results,
        nextInputsCursor,
        nextResultsCursor,
        startedAt,
      })
      return
    }
    runtime.process.manager.turn += 1
    const managerRun = await runManagerBatch({
      runtime,
      inputs: agentInputs,
      results,
      abortSignal: runAbortController.signal,
    })
    managerBatchId = managerRun.diagnostics.batchId
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
      triggeredPlanIds: collectTriggeredPlanIds(inputs),
      batchId: managerRun.diagnostics.batchId,
      ...(managerRun.diagnostics.roundId
        ? { roundId: managerRun.diagnostics.roundId }
        : {}),
    })
    const normalizedReplyText = normalizeManagerReplyText(parsed.text, {
      mode: results.length > 0 ? 'structured' : 'natural',
    })
    agentAppended = await appendManagerBatchReply({
      runtime,
      agentInputs,
      results,
      normalizedReplyText,
      nextInputsCursor,
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
      ...(managerRun.elapsedMs >= 0 ? { elapsedMs: managerRun.elapsedMs } : {}),
    })
    await completeSuccessfulManagerBatch({
      runtime,
      nextInputsCursor,
      nextResultsCursor,
      consumedInputIds: consumed.consumedInputIds,
      persistRuntime: persistRuntimeState,
      startedAt,
      batchId: managerRun.diagnostics.batchId,
      diagnostics: managerRun.diagnostics,
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
    })
  } catch (error) {
    if (
      runtime.process.session.stopped &&
      readProviderErrorCode(error) === 'provider_aborted'
    ) {
      await finishBatchWithoutAgentReply({
        runtime,
        batchId:
          managerBatchId ?? `batch-aborted-${runtime.process.manager.turn}`,
        inputs,
        results,
        nextInputsCursor,
        nextResultsCursor,
        startedAt,
      })
      return
    }
    await recoverManagerBatchFailure({
      runtime,
      batchId: managerBatchId ?? `batch-failed-${runtime.process.manager.turn}`,
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
    if (runtime.process.manager.runAbortController === runAbortController)
      runtime.process.manager.runAbortController = new AbortController()
    runtime.process.manager.running = false
    notifyUiSignal(runtime)
  }
}
