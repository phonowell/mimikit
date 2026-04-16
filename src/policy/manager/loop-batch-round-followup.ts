import { resolveScheduleNowIso } from '../../foundation/shared/time.js'
import { appendLog } from '../../persistence/log/append.js'

import { managerActionCliLogger } from './action-cli-log.js'
import { collectManagerActionValidationOutcome } from './action-feedback-collect.js'
import { buildActionFeedbackContext } from './loop-batch-run-helpers.js'

import type { ManagerTurnAction as Parsed } from './manager-turn-schema.js'
import type {
  ManagerActionFeedback,
  ManagerWakeProfile,
  TaskResult,
} from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'

const appendRoundActionFeedback = async (params: {
  runtime: ManagerRuntime
  batchId?: string
  roundId?: string
  actionFeedback: ManagerActionFeedback[]
}): Promise<void> => {
  const { actionFeedback } = params
  if (actionFeedback.length === 0) return
  for (const [index, item] of actionFeedback.entries()) {
    await managerActionCliLogger.logFeedback({
      item,
      index: index + 1,
      total: actionFeedback.length,
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.roundId ? { roundId: params.roundId } : {}),
      ...(params.runtime.process.manager.threadId
        ? { traceId: params.runtime.process.manager.threadId }
        : {}),
    })
  }
  await appendLog(params.runtime.paths.log, {
    event: 'manager_action_feedback',
    ...(params.runtime.process.manager.threadId
      ? { traceId: params.runtime.process.manager.threadId }
      : {}),
    ...(params.batchId ? { batchId: params.batchId } : {}),
    ...(params.roundId ? { roundId: params.roundId } : {}),
    count: actionFeedback.length,
    errors: actionFeedback.map((item) => item.error),
    names: actionFeedback.map((item) => item.action),
    codes: actionFeedback.flatMap((item) => (item.code ? [item.code] : [])),
  })
}

type RoundFollowupResult =
  | { filteredActions?: Parsed[]; actionFeedback: [] }
  | { filteredActions?: Parsed[]; actionFeedback: ManagerActionFeedback[] }

export const resolveRoundFollowup = async (params: {
  runtime: ManagerRuntime
  batchId?: string
  roundId?: string
  defaultFocusId?: string
  inputs?: Parameters<typeof buildActionFeedbackContext>[0]['inputs']
  results?: TaskResult[]
  parsed: Parsed[]
  output: string
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
  wakeProfile: ManagerWakeProfile
}): Promise<RoundFollowupResult> => {
  const validation = collectManagerActionValidationOutcome(
    params.parsed,
    {
      ...buildActionFeedbackContext({
        runtime: params.runtime,
        allowAskUserChoice: params.allowAskUserChoice,
        resultTaskIds: params.resultTaskIds,
        wakeProfile: params.wakeProfile,
        ...(params.defaultFocusId
          ? { defaultFocusId: params.defaultFocusId }
          : {}),
        ...(params.inputs ? { inputs: params.inputs } : {}),
      }),
      scheduleNowIso: resolveScheduleNowIso(
        params.runtime.process.session.lastUserMeta,
      ),
    },
    params.output,
  )
  const filteredActions =
    validation.suppressedActionIndexes.length > 0
      ? params.parsed.filter(
          (_, index) => !validation.suppressedActionIndexes.includes(index),
        )
      : undefined
  const actionableParsed = filteredActions ?? params.parsed
  void actionableParsed
  const actionFeedback = validation.feedback
  if (validation.suppressedActionIndexes.length > 0) {
    await appendLog(params.runtime.paths.log, {
      event: 'manager_action_suppressed',
      ...(params.runtime.process.manager.threadId
        ? { traceId: params.runtime.process.manager.threadId }
        : {}),
      ...(params.batchId ? { batchId: params.batchId } : {}),
      ...(params.roundId ? { roundId: params.roundId } : {}),
      count: validation.suppressedActionIndexes.length,
      names: validation.suppressedActionIndexes.map(
        (index) => params.parsed[index]?.type ?? 'unknown',
      ),
    })
  }
  if (actionFeedback.length === 0) {
    return {
      actionFeedback: [],
      ...(filteredActions ? { filteredActions } : {}),
    }
  }

  await appendRoundActionFeedback({
    runtime: params.runtime,
    ...(params.batchId ? { batchId: params.batchId } : {}),
    ...(params.roundId ? { roundId: params.roundId } : {}),
    actionFeedback,
  })

  return {
    actionFeedback,
    ...(filteredActions ? { filteredActions } : {}),
  }
}
