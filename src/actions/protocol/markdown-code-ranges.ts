import { parse, postprocess, preprocess } from 'micromark'

type Range = {
  start: number
  end: number
}

const hasRange = (range: Partial<Range>): range is Range =>
  Number.isFinite(range.start) &&
  Number.isFinite(range.end) &&
  (range.end ?? 0) > (range.start ?? 0)

const mergeRanges = (ranges: Range[]): Range[] => {
  if (ranges.length <= 1) return ranges
  const sorted = [...ranges].sort((left, right) => left.start - right.start)
  const merged: Range[] = []
  for (const current of sorted) {
    const previous = merged[merged.length - 1]
    if (!previous || current.start > previous.end) {
      merged.push({ ...current })
      continue
    }
    previous.end = Math.max(previous.end, current.end)
  }
  return merged
}

const isCodeBlockToken = (tokenType: string): boolean =>
  tokenType === 'codeFenced' || tokenType === 'codeIndented'

export const findMarkdownCodeRanges = (text: string): Range[] => {
  if (!text) return []
  const parser = parse()
  const events = postprocess(
    parser.document().write(preprocess()(text, 'utf8', true)),
  )
  const ranges: Range[] = []
  for (const [phase, token] of events) {
    if (phase !== 'enter') continue
    if (!isCodeBlockToken(token.type)) continue
    const start = token.start.offset
    const end = token.end.offset
    if (!hasRange({ start, end })) continue
    ranges.push({ start, end })
  }
  return mergeRanges(ranges)
}

export const isIndexInRanges = (index: number, ranges: Range[]): boolean => {
  for (const range of ranges)
    if (index >= range.start && index < range.end) return true
  return false
}

export type { Range }
