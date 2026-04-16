import { readProviderThreadId } from '../../execution/providers/thread-id.js'
import { mergeUsageAdditive } from '../../execution/shared/token-usage.js'
import { hasUserInputFromSource } from '../../surface/channels/shared/passive-reply.js'
import { isNoChoiceReturnChannelSource } from '../../surface/channels/shared/source.js'

import { runManagerRoundWithRecovery } from './loop-batch-exec.js'
import { resolveRoundFollowup } from './loop-batch-round-followup.js'
import { buildBatchSuccessResult } from './loop-batch-run-helpers.js'
import {
  buildCorrectionRoundResult,
  type ManagerRoundDiagnostics,
  updateManagerRoundDiagnostics,
} from './loop-batch-run-rounds-diagnostics.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type {
  FocusId,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

export const runManagerCorrectionRounds = async (params: {
  runtime: ManagerRuntime
  batchId: string
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: FocusId[]
  abortSignal?: AbortSignal
}): Promise<{
  parsed: {
    text: string
    actions: Parsed[]
  }
  usage?: TokenUsage
  elapsedMs: number
  diagnostics: ManagerRoundDiagnostics
}> => {
  const { runtime, inputs, results, tasks, plans, workingFocusIds } = params
  let elapsedMs = 0
  let managerThreadId = runtime.process.manager.threadId
  let lastDiagnostics: ManagerRoundDiagnostics = {
    batchId: params.batchId,
    roundCount: 0,
  }
  const resultTaskIds = new Set(results.map((item) => item.taskId))
  const allowAskUserChoice =
    !hasUserInputFromSource(inputs, 'telegram') &&
    !isNoChoiceReturnChannelSource(runtime.process.session.lastUserMeta?.source)
  const round = 1
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
  const batchUsage = mergeUsageAdditive(undefined, runResult.usage)
  const parsed = {
    text: runResult.output,
    actions: runResult.actions,
  }
  const followup = await resolveRoundFollowup({
    runtime,
    batchId: params.batchId,
    roundId: runResult.roundId,
    ...(workingFocusIds[0] ? { defaultFocusId: workingFocusIds[0] } : {}),
    inputs,
    results,
    parsed: parsed.actions,
    output: runResult.output,
    allowAskUserChoice,
    resultTaskIds,
    wakeProfile: runResult.wakeProfile,
  })
  const resolvedParsed =
    followup.filteredActions !== undefined
      ? { ...parsed, actions: followup.filteredActions }
      : parsed
  if (followup.actionFeedback.length === 0) {
    return buildBatchSuccessResult({
      parsed: resolvedParsed,
      elapsedMs,
      diagnostics: lastDiagnostics,
      ...(batchUsage ? { usage: batchUsage } : {}),
    })
  }
  return buildCorrectionRoundResult({
    runtime,
    batchId: params.batchId,
    round,
    actionFeedback: followup.actionFeedback,
    elapsedMs,
    diagnostics: lastDiagnostics,
    ...(batchUsage ? { usage: batchUsage } : {}),
    ...(managerThreadId ? { threadId: managerThreadId } : {}),
  })
}
