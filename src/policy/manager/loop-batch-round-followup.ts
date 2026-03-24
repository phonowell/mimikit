import { resolveScheduleNowIso } from '../../foundation/shared/time.js'
import { appendActionFeedbackSystemMessage } from '../../persistence/history/manager-events.js'
import { appendLog } from '../../persistence/log/append.js'

import { managerActionCliLogger } from './action-cli-log.js'
import {
  collectActionFeedbackHintBuckets,
  collectActionFeedbackHints,
} from './action-feedback-buckets.js'
import { collectManagerActionFeedback } from './action-feedback-collect.js'
import {
  buildActionFeedbackContext,
  hasNoFollowupRequests,
  type ManagerRoundExtra,
} from './loop-batch-run-helpers.js'

import type { FocusId } from '../../foundation/types/index.js'
import type { RuntimeState } from '../../kernel/orchestrator/runtime-state.js'
import type { Parsed } from '../actions/model/spec.js'

const appendRoundActionFeedback = async (params: {
  runtime: RuntimeState
  actionFeedback: ManagerRoundExtra['actionFeedback']
  resolveFocusId: () => FocusId
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
    hints: collectActionFeedbackHints(actionFeedback),
    hintBuckets: collectActionFeedbackHintBuckets(actionFeedback),
  })
  await appendActionFeedbackSystemMessage(
    params.runtime.paths.history,
    actionFeedback,
    params.resolveFocusId(),
  )
}

type RoundFollowupResult =
  | { done: true }
  | {
      done: false
      extra: ManagerRoundExtra
    }

export const resolveRoundFollowup = async (params: {
  runtime: RuntimeState
  parsed: Parsed[]
  output: string
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
  resolveFocusId: () => FocusId
  roundExtra?: ManagerRoundExtra
}): Promise<RoundFollowupResult> => {
  const wakeProfile =
    params.runtime.manager.lastContextPacket?.wakeProfile ?? 'mixed'
  const actionFeedback = collectManagerActionFeedback(
    params.parsed,
    {
      ...buildActionFeedbackContext({
        runtime: params.runtime,
        allowAskUserChoice: params.allowAskUserChoice,
        resultTaskIds: params.resultTaskIds,
        wakeProfile,
        inputs: params.runtime.session.inflightInputs,
      }),
      scheduleNowIso: resolveScheduleNowIso(
        params.runtime.session.lastUserMeta,
      ),
    },
    params.output,
  )
  if (hasNoFollowupRequests({ feedbackCount: actionFeedback.length }))
    return { done: true }

  await appendRoundActionFeedback({
    runtime: params.runtime,
    actionFeedback,
    resolveFocusId: params.resolveFocusId,
  })

  return {
    done: false,
    extra: {
      ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
    },
  }
}
