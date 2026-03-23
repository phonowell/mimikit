import { resolveDefaultFocusId } from '../focus/index.js'
import { appendManagerCorrectionLimitSystemMessage } from '../history/manager-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { requestMemoryRefresh } from '../memory/refresh/singleflight.js'
import { persistRuntimeState } from '../orchestrator/core/runtime-persistence.js'
import { notifyUiSignal } from '../orchestrator/core/signals.js'
import { readProviderErrorCode } from '../providers/provider-error.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
import { collectTriggeredPlanIds } from './loop-batch-context.js'
import {
  appendManagerReply,
  finishBatchWithoutAgentReply,
  recoverManagerBatchFailure,
} from './loop-batch-flow.js'
import { runManagerBatch } from './loop-batch-run-manager.js'
import {
  buildFallbackReply,
  consumeBatchHistory,
  finalizeBatchProgress,
} from './loop-helpers.js'
import { applyPlanCompletionState } from './plan-progress.js'
import { normalizeManagerReplyText } from './reply-normalize.js'
import { consumePendingManagerRestartReason } from './restart-runtime.js'
import { clearResultReplayBackoff } from './result-replay-backoff.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type { TaskResult, TokenUsage, UserInput } from '../types/index.js'

export const processManagerBatch = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  nextInputsCursor: number
  nextResultsCursor: number
}): Promise<void> => {
  const { runtime, inputs, results, nextInputsCursor, nextResultsCursor } =
    params
  applyPlanCompletionState(runtime, results)
  if (results.length > 0 || inputs.length > 0)
    runtime.manager.lastActivityAtMs = Date.now()
  runtime.manager.running = true
  notifyUiSignal(runtime)
  const runAbortController = new AbortController()
  runtime.manager.runAbortController = runAbortController
  const agentInputs = inputs.filter((item) => isVisibleToAgent(item))
  const startedAt = Date.now()
  let agentAppended = false
  try {
    if (runtime.session.stopped) {
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
    runtime.manager.turn += 1
    const managerRun = await runManagerBatch({
      runtime,
      inputs: agentInputs,
      results,
      abortSignal: runAbortController.signal,
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
      triggeredPlanIds: collectTriggeredPlanIds(inputs),
    })

    const normalizedReplyText = normalizeManagerReplyText(parsed.text)
    const responseText =
      normalizedReplyText ||
      normalizeManagerReplyText(
        await buildFallbackReply({
          results,
          tasks: runtime.tasks,
          workDir: runtime.config.workDir,
        }),
      )
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
    clearResultReplayBackoff(runtime)

    await appendLog(runtime.paths.log, {
      event: 'manager_end',
      status: 'ok',
      elapsedMs: Math.max(0, Date.now() - startedAt),
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
    })
    const pendingRestartReason = consumePendingManagerRestartReason(runtime)
    if (pendingRestartReason) {
      runtime.session.requestExit?.({
        code: 75,
        reason: pendingRestartReason,
      })
      return
    }
    requestMemoryRefresh(runtime)
  } catch (error) {
    if (
      runtime.session.stopped &&
      readProviderErrorCode(error) === 'provider_aborted'
    ) {
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
    if (runtime.manager.runAbortController === runAbortController)
      runtime.manager.runAbortController = new AbortController()
    runtime.manager.running = false
    notifyUiSignal(runtime)
  }
}
