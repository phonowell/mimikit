import { parseCommandAttrs } from '../shared/command-attrs.js'

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
