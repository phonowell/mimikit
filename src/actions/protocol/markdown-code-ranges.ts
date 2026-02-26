import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

type Range = {
  start: number
  end: number
}

type PositionedNode = {
  type?: string
  position?: {
    start?: { offset?: number | null } | null
    end?: { offset?: number | null } | null
  } | null
}

const markdownParser = unified().use(remarkParse)

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

const offsetsOf = (node: PositionedNode): Range | undefined => {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  if (typeof start !== 'number' || typeof end !== 'number') return
  if (!hasRange({ start, end })) return
  return { start, end }
}

export const findMarkdownCodeRanges = (text: string): Range[] => {
  if (!text) return []
  const tree = markdownParser.parse(text)
  const ranges: Range[] = []
  visit(tree, (node) => {
    const typed = node as PositionedNode
    if (typed.type !== 'code' && typed.type !== 'inlineCode') return
    const range = offsetsOf(typed)
    if (!range) return
    ranges.push(range)
  })
  return mergeRanges(ranges)
}

export const isIndexInRanges = (index: number, ranges: Range[]): boolean => {
  for (const range of ranges)
    if (index >= range.start && index < range.end) return true
  return false
}

export type { Range }
