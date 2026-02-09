import { collectTagMatches, extractActionText } from './extract-block.js'
import { parseLooseLines, parseTagMatches } from './parse-lines.js'

import type { Parsed } from '../model/parsed.js'

export const parseActions = (
  output: string,
): { actions: Parsed[]; text: string } => {
  const { actionText, text } = extractActionText(output)
  if (!actionText) return { actions: [], text }
  const lineActions = parseLooseLines(actionText)
  if (lineActions.length > 0) return { actions: lineActions, text }
  return { actions: parseTagMatches(collectTagMatches(actionText)), text }
}

export { parseLooseLines }
