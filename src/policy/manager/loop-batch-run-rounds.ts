import { readProviderThreadId } from '../../execution/providers/thread-id.js'
import { mergeUsageAdditive } from '../../execution/shared/token-usage.js'
import { appendLog } from '../../persistence/log/append.js'
import { hasUserInputFromSource } from '../../surface/channels/shared/passive-reply.js'
import { isNoChoiceReturnChannelSource } from '../../surface/channels/shared/source.js'

import {
  buildCorrectionFallbackReply,
  shouldRetrySelfRepairRound,
} from './loop-batch-correction-reply.js'
import { runManagerRoundWithRecovery } from './loop-batch-exec.js'
import { resolveRoundFollowup } from './loop-batch-round-followup.js'
import {
  buildBatchSuccessResult,
  buildRoundLimitResult,
  type ManagerRoundExtra,
} from './loop-batch-run-helpers.js'

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
  let managerThreadId = runtime.manager.threadId
  let extra: ManagerRoundExtra = {}
  let lastParsed: {
    text: string
    actions: Parsed[]
  } = { text: '', actions: [] }
  const resultTaskIds = new Set(results.map((item) => item.taskId))
  const allowAskUserChoice =
    !hasUserInputFromSource(inputs, 'telegram') &&
    !hasUserInputFromSource(inputs, 'feishu') &&
    !isNoChoiceReturnChannelSource(runtime.session.lastUserMeta?.source)
  for (let round = 1; round <= maxCorrectionRounds; round++) {
    if (round >= 2 && extra.actionFeedback && extra.actionFeedback.length > 0) {
      if (shouldRetrySelfRepairRound(round, extra.actionFeedback)) {
        await appendLog(runtime.paths.log, {
          event: 'manager_action_feedback_self_repair_retry',
          round,
          feedbackCount: extra.actionFeedback.length,
          errors: extra.actionFeedback.map((item) => item.error),
          names: extra.actionFeedback.map((item) => item.action),
        })
      } else {
        const fallbackReply = buildCorrectionFallbackReply(extra.actionFeedback)
        await appendLog(runtime.paths.log, {
          event: 'manager_correction_structured_clarify',
          round,
          feedbackCount: extra.actionFeedback.length,
          errors: extra.actionFeedback.map((item) => item.error),
          names: extra.actionFeedback.map((item) => item.action),
        })
        return buildRoundLimitResult({
          text: fallbackReply,
          elapsedMs,
          ...(batchUsage ? { usage: batchUsage } : {}),
        })
      }
    }
    const runResult = await (async () => {
      try {
        return await runManagerRoundWithRecovery({
          runtime,
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
          runtime.manager.threadId = errorThreadId
        }
        throw error
      }
    })()
    managerThreadId = runResult.threadId ?? managerThreadId
    if (managerThreadId) runtime.manager.threadId = managerThreadId
    else delete runtime.manager.threadId
    elapsedMs += runResult.elapsedMs
    batchUsage = mergeUsageAdditive(batchUsage, runResult.usage)
    const parsed = {
      text: runResult.output,
      actions: runResult.actions,
    }
    lastParsed = parsed
    const followup = await resolveRoundFollowup({
      runtime,
      inputs,
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
        ...(batchUsage ? { usage: batchUsage } : {}),
      })
    }
    extra = { ...followup.extra }
  }
  await appendLog(runtime.paths.log, {
    event: 'manager_correction_round_limit_reached',
    maxCorrectionRounds,
  })
  if (managerThreadId) runtime.manager.threadId = managerThreadId
  else delete runtime.manager.threadId
  return buildRoundLimitResult({
    text: extra.actionFeedback?.length
      ? buildCorrectionFallbackReply(extra.actionFeedback)
      : lastParsed.text,
    elapsedMs,
    ...(batchUsage ? { usage: batchUsage } : {}),
  })
}
