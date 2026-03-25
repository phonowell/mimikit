import { resolveScheduleNowIso } from '../../foundation/shared/time.js'
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
    hints: collectActionFeedbackHints(actionFeedback),
    hintBuckets: collectActionFeedbackHintBuckets(actionFeedback),
  })
}

type RoundFollowupResult =
  | { done: true }
  | {
      done: false
      extra: ManagerRoundExtra
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
  const actionFeedback = collectManagerActionFeedback(
    params.parsed,
    {
      ...buildActionFeedbackContext({
        runtime: params.runtime,
        allowAskUserChoice: params.allowAskUserChoice,
        resultTaskIds: params.resultTaskIds,
        wakeProfile: params.wakeProfile,
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
  })

  return {
    done: false,
    extra: {
      ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
    },
  }
}
