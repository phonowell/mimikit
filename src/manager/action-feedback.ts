import {
  type FeedbackContext,
  REGISTERED_MANAGER_ACTIONS,
  validateRegisteredManagerAction,
} from './action-feedback-validate.js'

import type { Parsed } from '../actions/model/spec.js'
import type { ManagerActionFeedback } from '../types/index.js'

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

const buildUnknownActionHint = (): string =>
  '仅可使用已注册 action：M:create_task, M:cancel_task, M:summarize_task_result, M:query_history, M:restart_server, M:sync_focuses。'

const pushFeedback = (
  feedback: ManagerActionFeedback[],
  seen: Set<string>,
  item: Parsed,
  error: string,
  hint: string,
): void => {
  const attempted = renderAttemptedAction(item)
  const key = `${error}\n${attempted}`
  if (seen.has(key)) return
  seen.add(key)
  feedback.push({
    action: item.name,
    error,
    hint,
    attempted,
  })
}

export const collectUnknownManagerActions = (
  items: Parsed[],
): ManagerActionFeedback[] => {
  const feedback: ManagerActionFeedback[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (REGISTERED_MANAGER_ACTIONS.has(item.name)) continue
    pushFeedback(
      feedback,
      seen,
      item,
      'unregistered_action',
      buildUnknownActionHint(),
    )
  }
  return feedback
}

export const collectManagerActionFeedback = (
  items: Parsed[],
  context: FeedbackContext = {},
): ManagerActionFeedback[] => {
  const feedback = collectUnknownManagerActions(items)
  const seen = new Set(
    feedback.map((item) => `${item.error}\n${item.attempted ?? ''}`),
  )
  for (const item of items) {
    if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) continue
    const issues = validateRegisteredManagerAction(item, context)
    for (const issue of issues)
      pushFeedback(feedback, seen, item, issue.error, issue.hint)
  }
  return feedback
}
