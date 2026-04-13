import { readProviderThreadId } from '../../execution/providers/thread-id.js'
import { mergeUsageAdditive } from '../../execution/shared/token-usage.js'
import { hasUserInputFromSource } from '../../surface/channels/shared/passive-reply.js'
import { isNoChoiceReturnChannelSource } from '../../surface/channels/shared/source.js'

import { buildCorrectionFallbackReply } from './loop-batch-correction-reply.js'
import { runManagerRoundWithRecovery } from './loop-batch-exec.js'
import { resolveRoundFollowup } from './loop-batch-round-followup.js'
import {
  buildBatchSuccessResult,
  buildRoundLimitResult,
  type ManagerRoundExtra,
} from './loop-batch-run-helpers.js'
import {
  appendManagerCorrectionRoundLimitReached,
  type ManagerRoundDiagnostics,
  resolveSelfRepairRoundContinuation,
  updateManagerRoundDiagnostics,
} from './loop-batch-run-rounds-diagnostics.js'

import type {
  FocusId,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

export const runManagerCorrectionRounds = async (params: {
  runtime: ManagerRuntime
  batchId: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: FocusId[]
  maxCorrectionRounds: number
  abortSignal?: AbortSignal
}): Promise<{
  parsed: {
    text: string
    actions: Parsed[]
  }
  usage?: TokenUsage
  elapsedMs: number
  roundLimitReached?: boolean
  diagnostics: ManagerRoundDiagnostics
}> => {
  const {
    runtime,
    inputs,
    results,
    tasks,
    plans,
    workingFocusIds,
    maxCorrectionRounds,
  } = params
  let elapsedMs = 0
  let batchUsage: TokenUsage | undefined
  let managerThreadId = runtime.process.manager.threadId
  let lastDiagnostics: ManagerRoundDiagnostics = {
    batchId: params.batchId,
    roundCount: 0,
  }
  let extra: ManagerRoundExtra = {}
  let lastParsed: {
    text: string
    actions: Parsed[]
  } = { text: '', actions: [] }
  const resultTaskIds = new Set(results.map((item) => item.taskId))
  const allowAskUserChoice =
    !hasUserInputFromSource(inputs, 'telegram') &&
    !isNoChoiceReturnChannelSource(runtime.process.session.lastUserMeta?.source)
  for (let round = 1; round <= maxCorrectionRounds; round++) {
    if (round >= 2 && extra.actionFeedback && extra.actionFeedback.length > 0) {
      const continuation = await resolveSelfRepairRoundContinuation({
        runtime,
        batchId: params.batchId,
        round,
        actionFeedback: extra.actionFeedback,
        elapsedMs,
        diagnostics: lastDiagnostics,
        ...(batchUsage ? { usage: batchUsage } : {}),
        ...(managerThreadId ? { threadId: managerThreadId } : {}),
      })
      if (!('continueRound' in continuation)) return continuation
    }
    const runResult = await (async () => {
      try {
        return await runManagerRoundWithRecovery({
          runtime,
          batchId: params.batchId,
          round,
          inputs,
          results,
          tasks,
          plans,
          workingFocusIds,
          extra,
          ...(params.abortSignal ? { abortSignal: params.abortSignal } : {}),
          ...(managerThreadId ? { managerThreadId } : {}),
        })
      } catch (error) {
        const errorThreadId = readProviderThreadId(error)
        if (errorThreadId) {
          managerThreadId = errorThreadId
          runtime.process.manager.threadId = errorThreadId
        }
        throw error
      }
    })()
    managerThreadId = runResult.threadId ?? managerThreadId
    lastDiagnostics = updateManagerRoundDiagnostics({
      batchId: params.batchId,
      round,
      runResult,
      ...(managerThreadId ? { threadId: managerThreadId } : {}),
    })
    if (managerThreadId) runtime.process.manager.threadId = managerThreadId
    else delete runtime.process.manager.threadId
    elapsedMs += runResult.elapsedMs
    batchUsage = mergeUsageAdditive(batchUsage, runResult.usage)
    const parsed = {
      text: runResult.output,
      actions: runResult.actions,
    }
    lastParsed = parsed
    const followup = await resolveRoundFollowup({
      runtime,
      batchId: params.batchId,
      roundId: runResult.roundId,
      inputs,
      results,
      parsed: parsed.actions,
      output: runResult.output,
      allowAskUserChoice,
      resultTaskIds,
      wakeProfile: runResult.wakeProfile,
      roundExtra: extra,
    })
    const resolvedParsed =
      followup.filteredActions !== undefined
        ? { ...parsed, actions: followup.filteredActions }
        : parsed
    if (followup.done) {
      return buildBatchSuccessResult({
        parsed: resolvedParsed,
        elapsedMs,
        diagnostics: lastDiagnostics,
        ...(batchUsage ? { usage: batchUsage } : {}),
      })
    }
    extra = { ...followup.extra }
  }
  await appendManagerCorrectionRoundLimitReached(runtime, {
    maxCorrectionRounds,
    batchId: params.batchId,
    diagnostics: lastDiagnostics,
    ...(managerThreadId ? { threadId: managerThreadId } : {}),
  })
  if (managerThreadId) runtime.process.manager.threadId = managerThreadId
  else delete runtime.process.manager.threadId
  return buildRoundLimitResult({
    text: extra.actionFeedback?.length
      ? buildCorrectionFallbackReply(extra.actionFeedback)
      : lastParsed.text,
    elapsedMs,
    diagnostics: lastDiagnostics,
    ...(batchUsage ? { usage: batchUsage } : {}),
  })
}
