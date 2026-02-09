import { parseActions } from '../actions/protocol/parse.js'

const DIGEST_NAMES = new Set<string>(['digest_context', 'handoff_context'])

export const extractDigestSummary = (output: string): string => {
  const trimmed = output.trim()
  if (!trimmed) return ''

  const parsed = parseActions(trimmed)
  for (const action of parsed.actions) {
    if (!DIGEST_NAMES.has(action.name)) continue
    const summaryAttr = action.attrs.summary?.trim()
    if (summaryAttr) return summaryAttr
  }

  return ''
}
