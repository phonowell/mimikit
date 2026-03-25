import {
  collectTagMatches,
  extractActionText,
} from '../actions/protocol/extract-block.js'
import {
  findMarkdownCodeRanges,
  isIndexInRanges,
} from '../actions/protocol/markdown-code-ranges.js'

import {
  formatActionInCodeBlockHint,
  formatInvalidActionSyntaxHint,
} from './action-feedback-hints.js'

import type { ManagerActionFeedback } from '../../foundation/types/index.js'

const INVALID_ACTION_SYNTAX_ERROR = 'invalid_action_syntax'
const INVALID_ACTION_SYNTAX_HINT = formatInvalidActionSyntaxHint()
const ACTION_IN_CODE_BLOCK_HINT = formatActionInCodeBlockHint()

const detectActionSnippet = (output: string, index: number): string => {
  const gt = output.indexOf('>', index)
  const lf = output.indexOf('\n', index)
  let end = output.length
  if (gt >= 0) end = Math.min(end, gt + 1)
  if (lf >= 0) end = Math.min(end, lf)
  const snippet = output.slice(index, end).replace(/\s+/g, ' ').trim()
  return snippet.length > 0 ? snippet : '<M:unknown />'
}

export const detectUnparsedActionIssue = (
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
    if (isIndexInRanges(index, codeRanges)) inCode ??= { action, attempted }
    else {
      outside ??= { action, attempted }
      if (zoneStart >= 0 && index < zoneStart && !outsideBeforeZone)
        outsideBeforeZone = { action, attempted }
      if (!parsedTagStarts.has(index) && !outsideUnparsed)
        outsideUnparsed = { action, attempted }
    }
    match = tagRe.exec(output)
  }

  const syntaxIssue =
    outsideUnparsed ?? (!hasParsedActions ? outside : outsideBeforeZone)
  if (syntaxIssue) {
    return {
      action: syntaxIssue.action,
      error: INVALID_ACTION_SYNTAX_ERROR,
      hint: INVALID_ACTION_SYNTAX_HINT,
      attempted: syntaxIssue.attempted,
      code: 'invalid_action_syntax',
      repair: { kind: 'fix_action_markup' },
    }
  }
  if (hasParsedActions || !inCode) return undefined
  return {
    action: inCode.action,
    error: INVALID_ACTION_SYNTAX_ERROR,
    hint: ACTION_IN_CODE_BLOCK_HINT,
    attempted: inCode.attempted,
    code: 'invalid_action_syntax',
    repair: { kind: 'fix_action_markup' },
  }
}
