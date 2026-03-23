import { parseActions } from '../actions/protocol/parse.js'
import {
  hasNoChoiceReturnChannelInput,
  isNoChoiceReturnChannelSource,
} from '../channels/feishu/source.js'
import { appendLog } from '../log/append.js'
import { readProviderThreadId } from '../providers/thread-id.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'

import {
  buildCorrectionFallbackReply,
  findRepeatedRejectedAction,
  resolveDominantRejectedClass,
  shouldRetrySelfRepairRound,
} from './loop-batch-correction-reply.js'
import { runManagerRoundWithRecovery } from './loop-batch-exec.js'
import { resolveRoundFollowup } from './loop-batch-round-followup.js'
import {
  buildBatchSuccessResult,
  buildRoundLimitResult,
  type ManagerRoundExtra,
} from './loop-batch-run-helpers.js'

import type { RuntimeState } from '../orchestrator/core/runtime-state.js'
import type {
  FocusId,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

export const runManagerCorrectionRounds = async (params: {
  runtime: RuntimeState
  inputs: UserInput[]
  results: TaskResult[]
  tasks: Task[]
  plans: TaskPlan[]
  workingFocusIds: FocusId[]
  maxCorrectionRounds: number
  resolveFocusId: () => FocusId
  abortSignal?: AbortSignal
}): Promise<{
  parsed: ReturnType<typeof parseActions>
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
    resolveFocusId,
  } = params
  let elapsedMs = 0
  let batchUsage: TokenUsage | undefined
  let promptPrefixHash: string | undefined
  let managerThreadId = runtime.manager.threadId
  let extra: ManagerRoundExtra = {}
  let lastParsed = parseActions('')
  const resultTaskIds = new Set(results.map((item) => item.taskId))
  const allowAskUserChoice =
    !hasNoChoiceReturnChannelInput(inputs) &&
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
        const repeatedRejectedAction = findRepeatedRejectedAction(
          extra.actionFeedback,
        )
        const dominantRejectedClass = resolveDominantRejectedClass(
          extra.actionFeedback,
        )
        await appendLog(runtime.paths.log, {
          event: repeatedRejectedAction
            ? 'manager_action_rejection_circuit_open'
            : 'manager_correction_structured_clarify',
          round,
          feedbackCount: extra.actionFeedback.length,
          ...(dominantRejectedClass
            ? { rejectedClass: dominantRejectedClass }
            : {}),
          ...(repeatedRejectedAction ? { action: repeatedRejectedAction } : {}),
        })
        if (promptPrefixHash) {
          await appendLog(runtime.paths.log, {
            event: 'manager_prompt_prefix_hash',
            rounds: round - 1,
            hash: promptPrefixHash,
          })
        }
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
    if (!promptPrefixHash) promptPrefixHash = runResult.promptPrefixHash
    else if (promptPrefixHash !== runResult.promptPrefixHash) {
      await appendLog(runtime.paths.log, {
        event: 'manager_prompt_prefix_changed',
        round,
        previousPrefixHash: promptPrefixHash,
        nextPrefixHash: runResult.promptPrefixHash,
      })
      promptPrefixHash = runResult.promptPrefixHash
    }
    const parsed = parseActions(runResult.output)
    lastParsed = parsed
    const followup = await resolveRoundFollowup({
      runtime,
      parsed: parsed.actions,
      output: runResult.output,
      allowAskUserChoice,
      resultTaskIds,
      resolveFocusId,
      roundExtra: extra,
    })
    if (followup.done) {
      if (promptPrefixHash) {
        await appendLog(runtime.paths.log, {
          event: 'manager_prompt_prefix_hash',
          rounds: round,
          hash: promptPrefixHash,
        })
      }
      return buildBatchSuccessResult({
        parsed,
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
  if (promptPrefixHash) {
    await appendLog(runtime.paths.log, {
      event: 'manager_prompt_prefix_hash',
      rounds: maxCorrectionRounds,
      hash: promptPrefixHash,
    })
  }
  if (managerThreadId) runtime.manager.threadId = managerThreadId
  else delete runtime.manager.threadId
  return buildRoundLimitResult({
    text: lastParsed.text,
    elapsedMs,
    ...(batchUsage ? { usage: batchUsage } : {}),
  })
}
