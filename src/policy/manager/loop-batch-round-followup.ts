import { resolveScheduleNowIso } from '../../foundation/shared/time.js'
import { readHistory } from '../../persistence/history/store.js'
import { appendLog } from '../../persistence/log/append.js'

import { managerActionCliLogger } from './action-cli-log.js'
import { collectManagerActionValidationOutcome } from './action-feedback-collect.js'
import { collectHistoricalUserIntentTexts } from './action-intent-evidence-match.js'
import {
  buildActionFeedbackContext,
  hasNoFollowupRequests,
  type ManagerRoundExtra,
} from './loop-batch-run-helpers.js'

import type { ManagerWakeProfile } from '../../foundation/types/index.js'
import type { ManagerRuntime } from '../../kernel/orchestrator/runtime-interfaces.js'
import type { Parsed } from '../actions/model/spec.js'

const appendRoundActionFeedback = async (params: {
  runtime: ManagerRuntime
  actionFeedback: ManagerRoundExtra['actionFeedback']
}): Promise<void> => {
  const { actionFeedback } = params
  if (!actionFeedback || actionFeedback.length === 0) return
  for (const [index, item] of actionFeedback.entries()) {
    await managerActionCliLogger.logFeedback({
      item,
      index: index + 1,
      total: actionFeedback.length,
      ...(params.runtime.manager.threadId
        ? { traceId: params.runtime.manager.threadId }
        : {}),
    })
  }
  await appendLog(params.runtime.paths.log, {
    event: 'manager_action_feedback',
    count: actionFeedback.length,
    errors: actionFeedback.map((item) => item.error),
    names: actionFeedback.map((item) => item.action),
    codes: actionFeedback.flatMap((item) => (item.code ? [item.code] : [])),
  })
}

type RoundFollowupResult =
  | {
      done: true
      filteredActions?: Parsed[]
    }
  | {
      done: false
      extra: ManagerRoundExtra
      filteredActions?: Parsed[]
    }

export const resolveRoundFollowup = async (params: {
  runtime: ManagerRuntime
  parsed: Parsed[]
  output: string
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
  wakeProfile: ManagerWakeProfile
  roundExtra?: ManagerRoundExtra
}): Promise<RoundFollowupResult> => {
  const recentUserIntentTexts = params.parsed.some(
    (item) => item.type === 'remember_memory',
  )
    ? collectHistoricalUserIntentTexts(
        await readHistory(params.runtime.paths.history),
      )
    : []
  const validation = collectManagerActionValidationOutcome(
    params.parsed,
    {
      ...buildActionFeedbackContext({
        runtime: params.runtime,
        allowAskUserChoice: params.allowAskUserChoice,
        resultTaskIds: params.resultTaskIds,
        wakeProfile: params.wakeProfile,
        inputs: params.runtime.session.inflightInputs,
        ...(recentUserIntentTexts.length > 0 ? { recentUserIntentTexts } : {}),
      }),
      scheduleNowIso: resolveScheduleNowIso(
        params.runtime.session.lastUserMeta,
      ),
    },
    params.output,
  )
  const actionFeedback = validation.feedback
  const filteredActions =
    validation.suppressedActionIndexes.length > 0
      ? params.parsed.filter(
          (_, index) => !validation.suppressedActionIndexes.includes(index),
        )
      : undefined
  if (validation.suppressedActionIndexes.length > 0) {
    await appendLog(params.runtime.paths.log, {
      event: 'manager_action_suppressed',
      count: validation.suppressedActionIndexes.length,
      names: validation.suppressedActionIndexes.map(
        (index) => params.parsed[index]?.type ?? 'unknown',
      ),
    })
  }
  if (hasNoFollowupRequests({ feedbackCount: actionFeedback.length })) {
    return {
      done: true,
      ...(filteredActions ? { filteredActions } : {}),
    }
  }

  await appendRoundActionFeedback({
    runtime: params.runtime,
    actionFeedback,
  })

  return {
    done: false,
    extra: {
      ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
    },
    ...(filteredActions ? { filteredActions } : {}),
  }
}
