import { parseActions } from '../actions/protocol/parse.js'
import {
  hasNoChoiceReturnChannelInput,
  isNoChoiceReturnChannelSource,
} from '../channels/feishu/source.js'
import { appendLog } from '../log/append.js'
import { readProviderThreadId } from '../shared/provider-thread-id.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'

import { runManagerRoundWithRecovery } from './loop-batch-exec.js'
import { resolveRoundFollowup } from './loop-batch-round-followup.js'
import {
  buildBatchSuccessResult,
  buildRoundLimitResult,
  type ManagerRoundExtra,
  mergeReadFileLookupHistory,
} from './loop-batch-run-helpers.js'

import type { RuntimeState } from './runtime-adapter.js'
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
  let previousLookupKey: string | undefined
  let promptPrefixHash: string | undefined
  let { managerThreadId } = runtime
  let extra: ManagerRoundExtra = {}
  let lastParsed = parseActions('')
  const resultTaskIds = new Set(results.map((item) => item.taskId))
  const allowAskUserChoice =
    !hasNoChoiceReturnChannelInput(inputs) &&
    !isNoChoiceReturnChannelSource(runtime.lastUserMeta?.source)
  for (let round = 1; round <= maxCorrectionRounds; round++) {
    if (round >= 2 && extra.actionFeedback && extra.actionFeedback.length > 0) {
      await appendLog(runtime.paths.log, {
        event: 'manager_correction_structured_clarify',
        round,
        feedbackCount: extra.actionFeedback.length,
      })
      if (promptPrefixHash) {
        await appendLog(runtime.paths.log, {
          event: 'manager_prompt_prefix_hash',
          rounds: round - 1,
          hash: promptPrefixHash,
        })
      }
      return buildRoundLimitResult({
        text: '继续执行前请先补齐三项信息：1) 明确目标；2) 明确范围与不做项；3) 明确可验收标准（至少一条）。',
        elapsedMs,
        ...(batchUsage ? { usage: batchUsage } : {}),
      })
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
          ...(managerThreadId ? { managerThreadId } : {}),
        })
      } catch (error) {
        const errorThreadId = readProviderThreadId(error)
        if (errorThreadId) {
          managerThreadId = errorThreadId
          runtime.managerThreadId = managerThreadId
        }
        throw error
      }
    })()
    managerThreadId = runResult.threadId ?? managerThreadId
    if (managerThreadId) runtime.managerThreadId = managerThreadId
    else delete runtime.managerThreadId
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
      ...(previousLookupKey ? { previousLookupKey } : {}),
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
    previousLookupKey = followup.lookupKey
    const mergedReadFileLookup = mergeReadFileLookupHistory({
      previous: extra.readFileLookup,
      current: followup.extra.readFileLookup,
    })
    extra = {
      ...followup.extra,
      ...(mergedReadFileLookup ? { readFileLookup: mergedReadFileLookup } : {}),
      ...(followup.extra.queryLookup
        ? { queryLookup: followup.extra.queryLookup }
        : extra.queryLookup
          ? { queryLookup: extra.queryLookup }
          : {}),
    }
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
  if (managerThreadId) runtime.managerThreadId = managerThreadId
  else delete runtime.managerThreadId
  return buildRoundLimitResult({
    text: lastParsed.text,
    elapsedMs,
    ...(batchUsage ? { usage: batchUsage } : {}),
  })
}
