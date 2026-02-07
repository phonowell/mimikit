import {
  collectCommandMatches,
  extractCommandsAndText,
} from './command-parser-zones.js'

export type ParsedCommand = {
  action: string
  attrs: Record<string, string>
  content?: string
}

const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g
const COMMAND_LINE_RE = /^@([a-zA-Z_][\w-]*)(?:\s+(.+))?$/

const parseAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(ATTR_RE)) {
    const key = match[1]
    const value = match[2] ?? ''
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
        attrs: parseAttrs(match[2] ?? ''),
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
    const attrs = parseAttrs(raw)
    if (raw.startsWith('{') || raw.startsWith('[')) {
      commands.push({ action, attrs, content: raw })
      continue
    }
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

export const parseCommandPayload = <T>(
  command: ParsedCommand,
): T | undefined => {
  const content = command.content?.trim()
  if (!content) return undefined
  try {
    return JSON.parse(content) as T
  } catch {
    return undefined
  }
}
