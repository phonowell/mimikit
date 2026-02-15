const M_TAG =
  /<M:(\w+)((?:\s+\w+\s*=\s*"[^"]*")*)\s*(?:\/>|>(?:([\s\S]*?)<\/M:\1>)?)/g

type Range = {
  start: number
  end: number
}

type Zone = {
  parseStart: number
  parseEnd: number
  removeStart: number
  removeEnd: number
}

const createTagRegExp = (): RegExp => new RegExp(M_TAG.source, 'g')

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

const findZone = (output: string): Zone | undefined => {
  const codeBlocks = findCodeBlockRanges(output)
  const masked = maskRanges(output, codeBlocks, 'x')

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

const stripTrailingMetaTagFragment = (text: string): string => {
  if (!text) return text
  const ranges = findCodeBlockRanges(text)
  const lastOpen = text.lastIndexOf('<M:')
  const lastClose = text.lastIndexOf('</M:')
  const start = Math.max(lastOpen, lastClose)
  if (start < 0) return text
  if (isIndexInRanges(start, ranges)) return text

  const tail = text.slice(start)
  if (tail.includes('>')) return text
  if (!/^<\/?M:\w*/.test(tail)) return text
  return text.slice(0, start).trimEnd()
}

export const collectTagMatches = (text: string): RegExpMatchArray[] => {
  const ranges = findCodeBlockRanges(text)
  return [...text.matchAll(createTagRegExp())].filter((match) => {
    const start = match.index
    return !isIndexInRanges(start, ranges)
  })
}

export const extractActionText = (
  output: string,
): { actionText: string; text: string } => {
  const zone = findZone(output)
  const actionText = zone ? output.slice(zone.parseStart, zone.parseEnd) : ''
  const withoutActions = zone
    ? output.slice(0, zone.removeStart) + output.slice(zone.removeEnd)
    : output
  const text = stripTrailingMetaTagFragment(
    removeTagsOutsideCodeBlocks(withoutActions),
  )
  return { actionText, text }
}
