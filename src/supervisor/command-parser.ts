export type ParsedCommand = {
  action: string
  attrs: Record<string, string>
  content?: string
}

const MIMIKIT_TAG =
  /<MIMIKIT:(\w+)((?:\s+\w+\s*=\s*"[^"]*")*)\s*(?:\/>|>(?:([\s\S]*?)<\/MIMIKIT:\1>)?)/g
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g
const COMMANDS_START_MARKER = '[MIMIKIT_COMMANDS]'
const COMMANDS_END_MARKER = '[/MIMIKIT_COMMANDS]'

type Range = {
  start: number
  end: number
}

type CommandZone = {
  parseStart: number
  parseEnd: number
  removeStart: number
  removeEnd: number
}

const createTagRegExp = (): RegExp => new RegExp(MIMIKIT_TAG.source, 'g')

const isFenceLine = (line: string): boolean =>
  line.trimStart().startsWith('```')

const findCodeBlockRanges = (text: string): Range[] => {
  const ranges: Range[] = []
  let inBlock = false
  let blockStart = 0
  let pos = 0
  while (pos < text.length) {
    const nextNewline = text.indexOf('\n', pos)
    const lineEnd = nextNewline === -1 ? text.length : nextNewline
    const lineEndExclusive = nextNewline === -1 ? text.length : nextNewline + 1
    const line = text.slice(pos, lineEnd)
    if (isFenceLine(line)) {
      if (!inBlock) {
        inBlock = true
        blockStart = pos
      } else {
        inBlock = false
        ranges.push({ start: blockStart, end: lineEndExclusive })
      }
    }
    pos = lineEndExclusive
  }
  if (inBlock) ranges.push({ start: blockStart, end: text.length })
  return ranges
}

const maskRanges = (
  text: string,
  ranges: Range[],
  maskChar: string,
): string => {
  if (ranges.length === 0) return text
  const chars = text.split('')
  for (const range of ranges)
    for (let i = range.start; i < range.end; i += 1) chars[i] = maskChar

  return chars.join('')
}

const isIndexInRanges = (index: number, ranges: Range[]): boolean => {
  for (const range of ranges)
    if (index >= range.start && index < range.end) return true

  return false
}

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
    .filter((command) => command.action.length > 0)

const collectCommandMatches = (text: string): RegExpMatchArray[] => {
  const ranges = findCodeBlockRanges(text)
  return [...text.matchAll(createTagRegExp())].filter((match) => {
    const start = match.index
    return !isIndexInRanges(start, ranges)
  })
}

const findCommandZone = (output: string): CommandZone | undefined => {
  const codeBlocks = findCodeBlockRanges(output)
  const masked = maskRanges(output, codeBlocks, 'x')
  const markerStart = masked.lastIndexOf(COMMANDS_START_MARKER)
  if (markerStart !== -1) {
    const parseStart = markerStart + COMMANDS_START_MARKER.length
    const markerEnd = masked.indexOf(COMMANDS_END_MARKER, parseStart)
    const parseEnd = markerEnd === -1 ? output.length : markerEnd
    const removeStart = markerStart
    const removeEnd =
      markerEnd === -1 ? output.length : markerEnd + COMMANDS_END_MARKER.length
    return { parseStart, parseEnd, removeStart, removeEnd }
  }

  const matches = [...masked.matchAll(createTagRegExp())]
  if (matches.length === 0) return undefined
  let zoneStart: number | null = null
  let zoneEnd = masked.length
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const match = matches[i]
    if (!match) continue
    const start = match.index
    const end = start + match[0].length
    const gap = masked.slice(end, zoneEnd)
    if (!/^\s*$/.test(gap)) break
    zoneStart = start
    zoneEnd = start
  }
  if (zoneStart === null) return undefined
  return {
    parseStart: zoneStart,
    parseEnd: output.length,
    removeStart: zoneStart,
    removeEnd: output.length,
  }
}

const removeTagsOutsideCodeBlocks = (text: string): string => {
  const ranges = findCodeBlockRanges(text)
  if (ranges.length === 0) return text.replace(createTagRegExp(), '').trim()
  const matches = [...text.matchAll(createTagRegExp())]
  if (matches.length === 0) return text.trim()
  let result = ''
  let lastIndex = 0
  for (const match of matches) {
    const start = match.index
    const end = start + match[0].length
    if (isIndexInRanges(start, ranges)) continue
    result += text.slice(lastIndex, start)
    lastIndex = end
  }
  result += text.slice(lastIndex)
  return result.trim()
}

const extractCommandsAndText = (
  output: string,
): { commandText: string; text: string } => {
  const zone = findCommandZone(output)
  const commandText = zone ? output.slice(zone.parseStart, zone.parseEnd) : ''
  const withoutCommands = zone
    ? output.slice(0, zone.removeStart) + output.slice(zone.removeEnd)
    : output
  const text = removeTagsOutsideCodeBlocks(withoutCommands)
  return { commandText, text }
}

export const parseCommands = (
  output: string,
): {
  commands: ParsedCommand[]
  text: string
} => {
  const { commandText, text } = extractCommandsAndText(output)
  if (!commandText) return { commands: [], text }
  const commands = parseCommandMatches(collectCommandMatches(commandText))
  return { commands, text }
}
