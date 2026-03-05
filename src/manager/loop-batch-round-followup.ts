import { appendActionFeedbackSystemMessage } from '../history/manager-events.js'
import { pickQueryHistoryRequest } from '../history/query.js'
import { appendLog } from '../log/append.js'
import { resolveScheduleNowIso } from '../shared/time.js'

import { collectManagerActionFeedback } from './action-feedback-collect.js'
import {
  buildHistoryQueryKey,
  buildReadFileLookupKey,
  buildTaskArchiveLookupKey,
  pickQueryTaskArchiveRequest,
  pickReadFileRequest,
  queryHistoryLookup,
  queryReadFileLookup,
  queryTaskArchiveLookup,
} from './loop-batch-context.js'
import {
  buildActionFeedbackContext,
  buildLookupKey,
  hasNoFollowupRequests,
  type ManagerRoundExtra,
} from './loop-batch-run-helpers.js'

import type { RuntimeState } from './runtime-adapter.js'
import type { Parsed } from '../actions/model/spec.js'
import type { FocusId } from '../types/index.js'

const appendRoundActionFeedback = async (params: {
  runtime: RuntimeState
  actionFeedback: ManagerRoundExtra['actionFeedback']
  resolveFocusId: () => FocusId
}): Promise<void> => {
  const { actionFeedback } = params
  if (!actionFeedback || actionFeedback.length === 0) return
  await appendLog(params.runtime.paths.log, {
    event: 'manager_action_feedback',
    count: actionFeedback.length,
    errors: actionFeedback.map((item) => item.error),
    names: actionFeedback.map((item) => item.action),
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
      lookupKey?: string
      extra: ManagerRoundExtra
    }

export const resolveRoundFollowup = async (params: {
  runtime: RuntimeState
  parsed: Parsed[]
  output: string
  allowAskUserChoice: boolean
  resultTaskIds: Set<string>
  resolveFocusId: () => FocusId
  previousLookupKey?: string
}): Promise<RoundFollowupResult> => {
  const actionFeedback = collectManagerActionFeedback(
    params.parsed,
    {
      ...buildActionFeedbackContext({
        runtime: params.runtime,
        allowAskUserChoice: params.allowAskUserChoice,
        resultTaskIds: params.resultTaskIds,
      }),
      scheduleNowIso: resolveScheduleNowIso(params.runtime.lastUserMeta),
    },
    params.output,
  )
  const queryRequest = pickQueryHistoryRequest(params.parsed)
  const readFileRequest = pickReadFileRequest(params.parsed)
  const taskArchiveRequest = pickQueryTaskArchiveRequest(params.parsed)
  const queryKey = buildHistoryQueryKey(queryRequest)
  const readFileKey = buildReadFileLookupKey(readFileRequest)
  const taskArchiveKey = buildTaskArchiveLookupKey(taskArchiveRequest)
  const lookupKey = buildLookupKey({
    ...(queryKey !== undefined ? { queryKey } : {}),
    ...(readFileKey !== undefined ? { readFileKey } : {}),
    ...(taskArchiveKey !== undefined ? { taskArchiveKey } : {}),
  })

  if (
    hasNoFollowupRequests({
      hasQueryRequest: Boolean(queryRequest),
      hasReadFileRequest: Boolean(readFileRequest),
      hasTaskArchiveRequest: Boolean(taskArchiveRequest),
      feedbackCount: actionFeedback.length,
    })
  )
    return { done: true }

  if (
    lookupKey &&
    actionFeedback.length === 0 &&
    params.previousLookupKey === lookupKey
  )
    throw new Error('manager_internal_lookup_repeated_without_progress')

  const [historyLookup, readFileLookup, taskArchiveLookup] = await Promise.all([
    queryHistoryLookup(params.runtime, queryRequest),
    queryReadFileLookup(params.runtime, readFileRequest),
    queryTaskArchiveLookup(params.runtime, taskArchiveRequest),
  ])

  await appendRoundActionFeedback({
    runtime: params.runtime,
    actionFeedback,
    resolveFocusId: params.resolveFocusId,
  })

  return {
    done: false,
    ...(lookupKey ? { lookupKey } : {}),
    extra: {
      ...(historyLookup ? { historyLookup } : {}),
      ...(readFileLookup ? { readFileLookup } : {}),
      ...(taskArchiveLookup ? { taskArchiveLookup } : {}),
      ...(actionFeedback.length > 0 ? { actionFeedback } : {}),
    },
  }
}
