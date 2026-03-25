import { formatUnregisteredActionHint } from './action-feedback-hints.js'
import { detectUnparsedActionIssue } from './action-feedback-unparsed.js'
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

const escapeAttr = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const renderAttemptedAction = (item: Parsed): string => {
  const attrs = Object.entries(item.attrs)
  if (attrs.length === 0) return `<M:${item.name} />`
  const attrsText = attrs
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(' ')
  return `<M:${item.name} ${attrsText} />`
}

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
    action: item.name,
    error: issue.error,
    hint: issue.hint,
    attempted,
    ...(issue.code ? { code: issue.code } : {}),
    ...(issue.repair ? { repair: issue.repair } : {}),
  })
}

const pushRawFeedback = (
  feedback: ManagerActionFeedback[],
  seen: Set<string>,
  item: ManagerActionFeedback,
): void => {
  const attempted = item.attempted?.trim() ?? ''
  const key = `${item.error}\n${attempted}`
  if (seen.has(key)) return
  seen.add(key)
  feedback.push(item)
}

export const collectManagerActionFeedback = (
  items: Parsed[],
  context: FeedbackContext = {},
  output = '',
): ManagerActionFeedback[] => {
  const feedback: ManagerActionFeedback[] = []
  const seen = new Set<string>()

  if (output.trim().length > 0) {
    const syntaxIssue = detectUnparsedActionIssue(output, items.length > 0)
    if (syntaxIssue) pushRawFeedback(feedback, seen, syntaxIssue)
  }

  for (const item of items) {
    const isRegistered = REGISTERED_MANAGER_ACTIONS.has(item.name)
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
    for (const issue of issues) pushFeedback(feedback, seen, item, issue)
  }
  return feedback
}
