import { parseCommands } from './command-parser.js'

const TELLER_DIGEST_ACTIONS = new Set(['teller_digest', 'handoff_thinker'])

export const extractTellerDigestSummary = (output: string): string => {
  const trimmed = output.trim()
  if (!trimmed) return ''

  const parsed = parseCommands(trimmed)
  for (const command of parsed.commands) {
    if (!TELLER_DIGEST_ACTIONS.has(command.action)) continue
    const summaryAttr = command.attrs.summary?.trim()
    if (summaryAttr) return summaryAttr
    const summaryContent = command.content?.trim()
    if (summaryContent) return summaryContent
  }

  const fallbackText = parsed.text.trim()
  if (fallbackText) return fallbackText
  return trimmed
}
