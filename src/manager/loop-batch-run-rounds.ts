import {
  hasNoChoiceReturnChannelInput,
  isNoChoiceReturnChannelSource,
} from '@mimikit/channels/channels/feishu/source'
import { readProviderThreadId } from '@mimikit/providers/providers/thread-id'

import { parseActions } from '../actions/protocol/parse.js'
import { appendLog } from '../log/append.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'

import {
  classifyRejectedActionFeedback,
  type RejectedActionClass,
} from './action-feedback-collect.js'
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
  ManagerActionFeedback,
  Task,
  TaskPlan,
  TaskResult,
  TokenUsage,
  UserInput,
} from '../types/index.js'

const LOOKUP_NO_PROGRESS_ERROR =
  'manager_internal_lookup_repeated_without_progress'

const LOOKUP_NO_PROGRESS_REPLY =
  '当前补充检索没有带来新的有效信息，本轮先停止继续检索。请直接补充更具体的对象、时间范围、文件路径，或明确希望我继续执行的下一步。'

const GENERIC_CORRECTION_REPLY =
  '继续执行前请先补齐三项信息：1) 明确目标；2) 明确范围与不做项；3) 明确可验收标准（至少一条）。'

const REJECTION_CLASS_REPLY: Record<RejectedActionClass, string> = {
  lookup_no_progress:
    '当前这类检索/读文件动作继续重试没有意义。本轮先停止重试；请直接补充更具体的查询词、时间范围、文件路径，或明确要我改做哪一步。',
  task_state_conflict:
    '当前动作和任务状态冲突，本轮停止重复尝试。请改为确认该任务是否应继续等待、恢复，或换一个仍可执行的目标。',
  needs_scope_confirmation:
    '当前派发动作缺少继续执行所需边界。本轮先停止重试；请补齐任务目标、范围/不做项、验收标准，或先缩小任务规模再继续。',
  channel_choice_unsupported:
    '当前输入来源不支持这类确认动作。本轮先停止重试；请直接提供明确决定，或改用无需交互选择的下一步。',
  result_not_available:
    '当前批次没有可直接消费的结果，本轮先停止重试。请等待任务继续产出结果，或明确指定要查看/恢复的任务。',
  blocked_action: GENERIC_CORRECTION_REPLY,
}

const findRepeatedRejectedAction = (
  feedback: ManagerActionFeedback[],
): string | undefined => {
  const counts = new Map<string, number>()
  for (const item of feedback) {
    if (item.error !== 'action_execution_rejected') continue
    const next = (counts.get(item.action) ?? 0) + 1
    counts.set(item.action, next)
    if (next >= 2) return item.action
  }
  return undefined
}

const resolveDominantRejectedClass = (
  feedback: ManagerActionFeedback[],
): RejectedActionClass | undefined => {
  const counts = new Map<RejectedActionClass, number>()
  let dominant: RejectedActionClass | undefined
  let max = 0
  for (const item of feedback) {
    if (item.error !== 'action_execution_rejected') continue
    const nextClass = classifyRejectedActionFeedback(item)
    const nextCount = (counts.get(nextClass) ?? 0) + 1
    counts.set(nextClass, nextCount)
    if (nextCount > max) {
      dominant = nextClass
      max = nextCount
    }
  }
  return dominant
}

const buildCorrectionFallbackReply = (
  feedback: ManagerActionFeedback[],
): string => {
  const repeatedRejectedAction = findRepeatedRejectedAction(feedback)
  if (repeatedRejectedAction)
    return `同类动作 ${repeatedRejectedAction} 已连续被拒绝，本轮停止重试。${REJECTION_CLASS_REPLY[resolveDominantRejectedClass(feedback) ?? 'blocked_action']}`
  const dominantRejectedClass = resolveDominantRejectedClass(feedback)
  if (dominantRejectedClass) return REJECTION_CLASS_REPLY[dominantRejectedClass]
  if (feedback.some((item) => item.action === 'query_context'))
    return LOOKUP_NO_PROGRESS_REPLY
  return GENERIC_CORRECTION_REPLY
}

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
  let managerThreadId = runtime.manager.threadId
  let extra: ManagerRoundExtra = {}
  let lastParsed = parseActions('')
  const resultTaskIds = new Set(results.map((item) => item.taskId))
  const allowAskUserChoice =
    !hasNoChoiceReturnChannelInput(inputs) &&
    !isNoChoiceReturnChannelSource(runtime.session.lastUserMeta?.source)
  for (let round = 1; round <= maxCorrectionRounds; round++) {
    if (round >= 2 && extra.actionFeedback && extra.actionFeedback.length > 0) {
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
          runtime.manager.threadId = managerThreadId
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
    let followup
    try {
      followup = await resolveRoundFollowup({
        runtime,
        parsed: parsed.actions,
        output: runResult.output,
        allowAskUserChoice,
        resultTaskIds,
        resolveFocusId,
        ...(previousLookupKey ? { previousLookupKey } : {}),
      })
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== LOOKUP_NO_PROGRESS_ERROR
      )
        throw error
      await appendLog(runtime.paths.log, {
        event: 'manager_lookup_no_progress_degraded',
        round,
        ...(previousLookupKey ? { lookupKey: previousLookupKey } : {}),
      })
      if (promptPrefixHash) {
        await appendLog(runtime.paths.log, {
          event: 'manager_prompt_prefix_hash',
          rounds: round,
          hash: promptPrefixHash,
        })
      }
      return buildRoundLimitResult({
        text: LOOKUP_NO_PROGRESS_REPLY,
        elapsedMs,
        ...(batchUsage ? { usage: batchUsage } : {}),
      })
    }
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
  if (managerThreadId) runtime.manager.threadId = managerThreadId
  else delete runtime.manager.threadId
  return buildRoundLimitResult({
    text: lastParsed.text,
    elapsedMs,
    ...(batchUsage ? { usage: batchUsage } : {}),
  })
}
