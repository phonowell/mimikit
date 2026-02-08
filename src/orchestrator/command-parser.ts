import {
  collectCommandMatches,
  extractCommandsAndText,
} from './command-parser-zones.js'

export type ParsedCommand = {
  action: string
  attrs: Record<string, string>
  content?: string
}

const COMMAND_LINE_RE = /^@([a-zA-Z_][\w-]*)(?:\s+(.+))?$/
const COMMAND_ATTR_RE = /(\w+)\s*=\s*"((?:\\.|[^"\\])*)"/g
const TELLER_DIGEST_ACTIONS = new Set(['teller_digest', 'handoff_thinker'])

const unescapeCommandAttrValue = (value: string): string =>
  value.replace(/\\([\\"nrt])/g, (_match, token: string) => {
    if (token === 'n') return '\n'
    if (token === 'r') return '\r'
    if (token === 't') return '\t'
    return token
  })

const parseCommandAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(COMMAND_ATTR_RE)) {
    const key = match[1]
    const value = unescapeCommandAttrValue(match[2] ?? '')
    if (!key) continue
    attrs[key] = value
  }
  return attrs
}

const parseCommandMatches = (matches: RegExpMatchArray[]): ParsedCommand[] =>
  matches
    .map((match) => {
      const content = match[3]?.trim()
      return {
        action: match[1] ?? '',
        attrs: parseCommandAttrs(match[2] ?? ''),
        ...(content ? { content } : {}),
      }
    })
    .filter(
      (command) => command.action.length > 0 && command.action !== 'commands',
    )

const parseCommandLines = (text: string): ParsedCommand[] => {
  const commands: ParsedCommand[] = []
  if (!text) return commands
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('@')) continue
    const match = trimmed.match(COMMAND_LINE_RE)
    if (!match) continue
    const action = match[1] ?? ''
    if (!action) continue
    const raw = match[2]?.trim() ?? ''
    const attrs = parseCommandAttrs(raw)
    commands.push({ action, attrs })
  }
  return commands
}

export const parseCommands = (
  output: string,
): {
  commands: ParsedCommand[]
  text: string
} => {
  const { commandText, text } = extractCommandsAndText(output)
  if (!commandText) return { commands: [], text }
  const lineCommands = parseCommandLines(commandText)
  if (lineCommands.length > 0) return { commands: lineCommands, text }
  const commands = parseCommandMatches(collectCommandMatches(commandText))
  return { commands, text }
}

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
