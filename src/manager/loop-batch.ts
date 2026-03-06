import { dispatchTelegramPassiveReply } from '../channels/telegram/index.js'
import { resolveDefaultFocusId } from '../focus/index.js'
import { appendManagerCorrectionLimitSystemMessage } from '../history/manager-events.js'
import { appendLog } from '../log/append.js'
import { bestEffort } from '../log/safe.js'
import { requestMemoryRefresh } from '../memory/refresh/singleflight.js'
import { isVisibleToAgent } from '../shared/message-visibility.js'

import { applyTaskActions, collectTaskResultSummaries } from './action-apply.js'
import {
  appendManagerReply,
  finishBatchWithoutAgentReply,
  recoverManagerBatchFailure,
} from './loop-batch-flow.js'
import { applyPlanCompletionState } from './loop-batch-pre.js'
import { runManagerBatch } from './loop-batch-run-manager.js'
import {
  buildFallbackReply,
  consumeBatchHistory,
  finalizeBatchProgress,
} from './loop-helpers.js'
import { normalizeManagerReplyText } from './reply-normalize.js'
import {
  notifyUiSignal,
  persistRuntimeState,
  type RuntimeState,
} from './runtime-adapter.js'

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
    runtime.lastManagerActivityAtMs = Date.now()
  runtime.managerRunning = true
  notifyUiSignal(runtime)
  const agentInputs = inputs.filter((item) => isVisibleToAgent(item))
  const startedAt = Date.now()
  let agentAppended = false
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

    const normalizedReplyText = normalizeManagerReplyText(parsed.text)
    const responseText =
      normalizedReplyText ||
      normalizeManagerReplyText(
        await buildFallbackReply({
          inputs: agentInputs,
          results,
        }),
      )
    await appendManagerReply({
      runtime,
      text: responseText,
      nextInputsCursor,
      ...(resolvedUsage ? { usage: resolvedUsage } : {}),
      ...(managerRun.elapsedMs >= 0 ? { elapsedMs: managerRun.elapsedMs } : {}),
    })
    await bestEffort('telegram:dispatch_passive_reply', () =>
      dispatchTelegramPassiveReply({
        runtime,
        inputs: agentInputs,
        replyText: responseText,
      }),
    )
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
    requestMemoryRefresh(runtime)
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
    runtime.managerRunning = false
    notifyUiSignal(runtime)
  }
}
