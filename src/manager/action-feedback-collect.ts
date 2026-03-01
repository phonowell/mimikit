import {
  findMarkdownCodeRanges,
  isIndexInRanges,
} from '../actions/protocol/markdown-code-ranges.js'

import {
  type FeedbackContext,
  REGISTERED_MANAGER_ACTIONS,
  validateRegisteredManagerAction,
} from './action-registry.js'

import type { Parsed } from '../actions/model/spec.js'
import type { ManagerActionFeedback } from '../types/index.js'

const UNREGISTERED_ACTION_HINT = `Only registered actions are allowed: ${[...REGISTERED_MANAGER_ACTIONS].map((name) => `M:${name}`).join(', ')}.`
const INVALID_ACTION_SYNTAX_ERROR = 'invalid_action_syntax'
const INVALID_ACTION_SYNTAX_HINT =
  'Detected M:action markup but no executable action was parsed. Put valid XML actions at the end of the reply (not in code blocks), and make sure tags/quotes are closed correctly.'
const ACTION_IN_CODE_BLOCK_HINT =
  'Detected M:action inside a code block, so it cannot be executed. Place actions at the end of the reply without code fences.'

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
  error: string,
  hint: string,
): void => {
  const attempted = renderAttemptedAction(item)
  const key = `${error}\n${attempted}`
  if (seen.has(key)) return
  seen.add(key)
  feedback.push({ action: item.name, error, hint, attempted })
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

const detectActionSnippet = (output: string, index: number): string => {
  const gt = output.indexOf('>', index)
  const lf = output.indexOf('\n', index)
  let end = output.length
  if (gt >= 0) end = Math.min(end, gt + 1)
  if (lf >= 0) end = Math.min(end, lf)
  const snippet = output.slice(index, end).replace(/\s+/g, ' ').trim()
  return snippet.length > 0 ? snippet : '<M:unknown />'
}

const detectUnparsedActionIssue = (
  output: string,
): ManagerActionFeedback | undefined => {
  const codeRanges = findMarkdownCodeRanges(output)
  const tagRe = /<\s*\/?\s*M:([A-Za-z_][\w:-]*)/g
  let outside:
    | { action: string; attempted: string }
    | undefined
  let inCode:
    | { action: string; attempted: string }
    | undefined

  let match = tagRe.exec(output)
  while (match) {
    const action = (match[1] ?? 'unknown').trim() || 'unknown'
    const index = match.index
    const attempted = detectActionSnippet(output, index)
    if (isIndexInRanges(index, codeRanges)) {
      if (!inCode) inCode = { action, attempted }
    } else if (!outside) outside = { action, attempted }
    match = tagRe.exec(output)
  }

  if (outside) {
    return {
      action: outside.action,
      error: INVALID_ACTION_SYNTAX_ERROR,
      hint: INVALID_ACTION_SYNTAX_HINT,
      attempted: outside.attempted,
    }
  }
  if (!inCode) return undefined
  return {
    action: inCode.action,
    error: INVALID_ACTION_SYNTAX_ERROR,
    hint: ACTION_IN_CODE_BLOCK_HINT,
    attempted: inCode.attempted,
  }
}

export const collectManagerActionFeedback = (
  items: Parsed[],
  context: FeedbackContext = {},
  output = '',
): ManagerActionFeedback[] => {
  const feedback: ManagerActionFeedback[] = []
  const seen = new Set<string>()

  if (items.length === 0 && output.trim().length > 0) {
    const syntaxIssue = detectUnparsedActionIssue(output)
    if (syntaxIssue) pushRawFeedback(feedback, seen, syntaxIssue)
  }

  for (const item of items) {
    if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) {
      pushFeedback(
        feedback,
        seen,
        item,
        'unregistered_action',
        UNREGISTERED_ACTION_HINT,
      )
    }
  }

  const seenWithUnknown = new Set(
    feedback.map((item) => `${item.error}\n${item.attempted ?? ''}`),
  )
  for (const item of items) {
    if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) continue
    const issues = validateRegisteredManagerAction(item, context)
    for (const issue of issues)
      pushFeedback(feedback, seenWithUnknown, item, issue.error, issue.hint)
  }
  return feedback
}
