import { parseActions } from '../actions/protocol/parse.js'
import { appendActionFeedbackSystemMessage } from '../history/manager-events.js'
import { pickQueryHistoryRequest } from '../history/query.js'
import { appendLog } from '../log/append.js'
import { resolveScheduleNowIso } from '../shared/time.js'
import { mergeUsageAdditive } from '../shared/token-usage.js'

import { collectManagerActionFeedback } from './action-feedback-collect.js'
import {
  buildHistoryQueryKey,
  buildReadFileLookupKey,
  pickReadFileRequest,
  queryHistoryLookup,
  queryReadFileLookup,
} from './loop-batch-context.js'
import { runManagerRoundWithRecovery } from './loop-batch-exec.js'
import {
  buildActionFeedbackContext,
  buildBatchSuccessResult,
  buildLookupKey,
  buildRoundLimitResult,
  hasNoFollowupRequests,
  type ManagerRoundExtra,
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
  stream: {
    appendDelta: (delta: string) => void
    setUsage: (usage: TokenUsage) => void
    commitParsedText: (text: string) => void
    resetCycle: () => void
  }
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
    stream,
    resolveFocusId,
  } = params

  let elapsedMs = 0
  let batchUsage: TokenUsage | undefined
  let previousLookupKey: string | undefined
  let extra: ManagerRoundExtra = {}
  let lastParsed = parseActions('')
  const hasQueryData = inputs.length > 0 || results.length > 0

  for (let round = 1; round <= maxCorrectionRounds; round++) {
    const runResult = await runManagerRoundWithRecovery({
      runtime,
      round,
      inputs,
      results,
      tasks,
      plans,
      workingFocusIds,
      extra,
      onTextDelta: stream.appendDelta,
      onUsage: stream.setUsage,
    })

    if (runResult.usage) stream.setUsage(runResult.usage)
    elapsedMs += runResult.elapsedMs
    batchUsage = mergeUsageAdditive(batchUsage, runResult.usage)

    const parsed = parseActions(runResult.output)
    lastParsed = parsed
    stream.commitParsedText(parsed.text)
    const scheduleNowIso = resolveScheduleNowIso(runtime.lastUserMeta)

    const actionFeedback = collectManagerActionFeedback(
      parsed.actions,
      {
        ...buildActionFeedbackContext({
          runtime,
          hasQueryData,
        }),
        scheduleNowIso,
      },
      runResult.output,
    )

    const queryRequest = pickQueryHistoryRequest(parsed.actions)
    const readFileRequest = pickReadFileRequest(parsed.actions)
    const queryKey = buildHistoryQueryKey(queryRequest)
    const readFileKey = buildReadFileLookupKey(readFileRequest)
    const lookupKey = buildLookupKey({
      ...(queryKey !== undefined ? { queryKey } : {}),
      ...(readFileKey !== undefined ? { readFileKey } : {}),
    })

    if (
      hasNoFollowupRequests({
        hasQueryRequest: Boolean(queryRequest),
        hasReadFileRequest: Boolean(readFileRequest),
        feedbackCount: actionFeedback.length,
      })
    ) {
      stream.commitParsedText(parsed.text)
      return buildBatchSuccessResult({
        parsed,
        elapsedMs,
        ...(batchUsage ? { usage: batchUsage } : {}),
      })
    }

    if (
      lookupKey &&
      actionFeedback.length === 0 &&
      previousLookupKey === lookupKey
    ) {
      throw new Error('manager_internal_lookup_repeated_without_progress')
    }

    previousLookupKey = lookupKey

    const [historyLookup, readFileLookup] = await Promise.all([
      queryHistoryLookup(runtime, queryRequest),
      queryReadFileLookup(runtime, readFileRequest),
    ])

    if (actionFeedback.length > 0) {
      await appendLog(runtime.paths.log, {
        event: 'manager_action_feedback',
        count: actionFeedback.length,
        errors: actionFeedback.map((item) => item.error),
        names: actionFeedback.map((item) => item.action),
      })
      await appendActionFeedbackSystemMessage(
        runtime.paths.history,
        actionFeedback,
        resolveFocusId(),
      )
    }

    stream.resetCycle()
    extra = {
      ...(historyLookup ? { historyLookup } : {}),
      ...(readFileLookup ? { readFileLookup } : {}),
      ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
    }
  }

  await appendLog(runtime.paths.log, {
    event: 'manager_correction_round_limit_reached',
    maxCorrectionRounds,
  })
  return buildRoundLimitResult({
    text: lastParsed.text,
    elapsedMs,
    ...(batchUsage ? { usage: batchUsage } : {}),
  })
}
