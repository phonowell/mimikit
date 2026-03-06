import {
  collectTagMatches,
  extractActionText,
} from '../actions/protocol/extract-block.js'
import {
  findMarkdownCodeRanges,
  isIndexInRanges,
} from '../actions/protocol/markdown-code-ranges.js'
import { queryHistorySchema } from '../history/query.js'

import {
  queryTaskArchiveSchema,
  readFileSchema,
} from './action-apply-schema.js'
import {
  formatActionInCodeBlockHint,
  formatInvalidActionSyntaxHint,
  formatUnregisteredActionHint,
} from './action-feedback-hints.js'
import {
  REGISTERED_MANAGER_ACTIONS,
  validateRegisteredManagerAction,
} from './action-registrations.js'
import { queryContextSchema } from './query-context-tool.js'

import type { FeedbackContext } from './action-validation.js'
import type { Parsed } from '../actions/model/spec.js'
import type { ManagerActionFeedback } from '../types/index.js'

const UNREGISTERED_ACTION_HINT = formatUnregisteredActionHint(
  [...REGISTERED_MANAGER_ACTIONS].map((name) => `M:${name}`),
)
const INVALID_ACTION_SYNTAX_ERROR = 'invalid_action_syntax'
const INVALID_ACTION_SYNTAX_HINT = formatInvalidActionSyntaxHint()
const ACTION_IN_CODE_BLOCK_HINT = formatActionInCodeBlockHint()
const SINGLE_LOOKUP_ACTION_LIMIT_HINTS: Record<string, string> = {
  query_history:
    'query_history 执行失败：同一轮最多保留一个 query_history action；请先合并查询条件。',
  query_context:
    'query_context 执行失败：同一轮最多保留一个 query_context action；请先合并 scopes 与过滤条件。',
  query_task_archive:
    'query_task_archive 执行失败：同一轮最多保留一个 query_task_archive action；请先合并查询条件。',
  read_file:
    'read_file 执行失败：同一轮最多保留一个 read_file action；请先合并读取范围。',
}

const isValidLookupAction = (item: Parsed): boolean => {
  if (item.name === 'query_history')
    return queryHistorySchema.safeParse(item.attrs).success
  if (item.name === 'query_context')
    return queryContextSchema.safeParse(item.attrs).success
  if (item.name === 'query_task_archive')
    return queryTaskArchiveSchema.safeParse(item.attrs).success
  if (item.name === 'read_file')
    return readFileSchema.safeParse(item.attrs).success
  return false
}

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
  hasParsedActions: boolean,
): ManagerActionFeedback | undefined => {
  const codeRanges = findMarkdownCodeRanges(output)
  const { actionText } = extractActionText(output)
  const zoneStart = actionText ? output.lastIndexOf(actionText) : -1
  const parsedTagStarts = new Set(
    collectTagMatches(output).map((tag) => tag.start),
  )
  const tagRe = /<\s*M:([A-Za-z_][\w:-]*)/g
  let outside: { action: string; attempted: string } | undefined
  let outsideBeforeZone: { action: string; attempted: string } | undefined
  let outsideUnparsed: { action: string; attempted: string } | undefined
  let inCode: { action: string; attempted: string } | undefined

  let match = tagRe.exec(output)
  while (match) {
    const action = (match[1] ?? 'unknown').trim() || 'unknown'
    const { index } = match
    const attempted = detectActionSnippet(output, index)
    if (isIndexInRanges(index, codeRanges)) {
      if (!inCode) inCode = { action, attempted }
    } else {
      if (!outside) outside = { action, attempted }
      if (zoneStart >= 0 && index < zoneStart && !outsideBeforeZone)
        outsideBeforeZone = { action, attempted }
      if (!parsedTagStarts.has(index) && !outsideUnparsed)
        outsideUnparsed = { action, attempted }
    }
    match = tagRe.exec(output)
  }

  if (outsideUnparsed) {
    return {
      action: outsideUnparsed.action,
      error: INVALID_ACTION_SYNTAX_ERROR,
      hint: INVALID_ACTION_SYNTAX_HINT,
      attempted: outsideUnparsed.attempted,
    }
  }
  if (!hasParsedActions && outside) {
    return {
      action: outside.action,
      error: INVALID_ACTION_SYNTAX_ERROR,
      hint: INVALID_ACTION_SYNTAX_HINT,
      attempted: outside.attempted,
    }
  }
  if (hasParsedActions && outsideBeforeZone) {
    return {
      action: outsideBeforeZone.action,
      error: INVALID_ACTION_SYNTAX_ERROR,
      hint: INVALID_ACTION_SYNTAX_HINT,
      attempted: outsideBeforeZone.attempted,
    }
  }
  if (hasParsedActions || !inCode) return undefined
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

  if (output.trim().length > 0) {
    const syntaxIssue = detectUnparsedActionIssue(output, items.length > 0)
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

  const lookupSeen = new Set<string>()
  for (const item of items) {
    if (!(item.name in SINGLE_LOOKUP_ACTION_LIMIT_HINTS)) continue
    if (!isValidLookupAction(item)) continue
    if (!lookupSeen.has(item.name)) {
      lookupSeen.add(item.name)
      continue
    }
    pushFeedback(
      feedback,
      seen,
      item,
      'action_execution_rejected',
      SINGLE_LOOKUP_ACTION_LIMIT_HINTS[item.name] ??
        'action 执行失败：重复 action。',
    )
  }

  for (const item of items) {
    if (!REGISTERED_MANAGER_ACTIONS.has(item.name)) continue
    const issues = validateRegisteredManagerAction(item, context)
    for (const issue of issues)
      pushFeedback(feedback, seen, item, issue.error, issue.hint)
  }
  return feedback
}
