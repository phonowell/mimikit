import { formatUnregisteredActionHint } from './action-feedback-hints.js'
import {
  REGISTERED_MANAGER_ACTIONS,
  validateRegisteredManagerAction,
} from './action-registry-definitions.js'

import type { FeedbackContext } from './action-validation.js'
import type { ManagerActionFeedback } from '../../foundation/types/index.js'
import type { Parsed } from '../actions/model/spec.js'

const UNREGISTERED_ACTION_HINT = formatUnregisteredActionHint(
  [...REGISTERED_MANAGER_ACTIONS].map((name) => `M:${name}`),
)

const renderAttemptedAction = (item: Parsed): string => JSON.stringify(item)

const pushFeedback = (
  feedback: ManagerActionFeedback[],
  seen: Set<string>,
  item: Parsed,
  issue: {
    error: string
    hint: string
    code?: ManagerActionFeedback['code']
    repair?: ManagerActionFeedback['repair']
  },
): void => {
  const attempted = renderAttemptedAction(item)
  const key = `${issue.error}\n${attempted}`
  if (seen.has(key)) return
  seen.add(key)
  feedback.push({
    action: item.type,
    error: issue.error,
    hint: issue.hint,
    attempted,
    ...(issue.code ? { code: issue.code } : {}),
    ...(issue.repair ? { repair: issue.repair } : {}),
  })
}

export const collectManagerActionValidationOutcome = (
  items: Parsed[],
  context: FeedbackContext = {},
  _output = '',
): {
  feedback: ManagerActionFeedback[]
  suppressedActionIndexes: number[]
} => {
  const feedback: ManagerActionFeedback[] = []
  const seen = new Set<string>()
  const suppressedActionIndexes: number[] = []

  for (const [index, item] of items.entries()) {
    const isRegistered = REGISTERED_MANAGER_ACTIONS.has(item.type)
    if (!isRegistered) {
      pushFeedback(feedback, seen, item, {
        error: 'unregistered_action',
        hint: UNREGISTERED_ACTION_HINT,
      })
      continue
    }

    const issues = validateRegisteredManagerAction(item, {
      ...context,
      currentActions: items,
    })
    const visibleIssues = issues.filter(
      (issue) => issue.disposition !== 'suppress',
    )
    if (
      visibleIssues.length === 0 &&
      issues.some((issue) => issue.disposition === 'suppress')
    ) {
      suppressedActionIndexes.push(index)
      continue
    }
    for (const issue of visibleIssues) pushFeedback(feedback, seen, item, issue)
  }
  return { feedback, suppressedActionIndexes }
}

export const collectManagerActionFeedback = (
  items: Parsed[],
  context: FeedbackContext = {},
  output = '',
): ManagerActionFeedback[] =>
  collectManagerActionValidationOutcome(items, context, output).feedback
