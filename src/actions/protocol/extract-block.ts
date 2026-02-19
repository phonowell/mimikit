import {
  findMarkdownCodeRanges,
  isIndexInRanges,
} from './markdown-code-ranges.js'
import { collectMetaTags, type MetaTag } from './meta-tag-scan.js'

type Zone = {
  parseStart: number
}

const hasOnlyWhitespace = (value: string): boolean => value.trim().length === 0

const findZone = (output: string, tags: MetaTag[]): Zone | undefined => {
  if (tags.length === 0) return undefined
  let zoneStart: number | null = null
  let zoneEnd = output.length
  for (let i = tags.length - 1; i >= 0; i -= 1) {
    const tag = tags[i]
    if (!tag) continue
    const gap = output.slice(tag.end, zoneEnd)
    if (!hasOnlyWhitespace(gap)) break
    zoneStart = tag.start
    zoneEnd = tag.start
  }
  if (zoneStart === null) return undefined
  return { parseStart: zoneStart }
}

const removeByTags = (
  text: string,
  tags: Pick<MetaTag, 'start' | 'end'>[],
): string => {
  if (tags.length === 0) return text
  let result = ''
  let cursor = 0
  for (const tag of tags) {
    if (tag.start < cursor || tag.end <= tag.start) continue
    result += text.slice(cursor, tag.start)
    cursor = tag.end
  }
  result += text.slice(cursor)
  return result
}

const removeTagsOutsideCodeBlocks = (text: string, tags: MetaTag[]): string =>
  removeByTags(text, tags).trim()

const stripTrailingMetaTagFragment = (
  text: string,
  codeRanges: ReturnType<typeof findMarkdownCodeRanges>,
): string => {
  if (!text) return text
  const lastOpen = text.lastIndexOf('<M:')
  const lastClose = text.lastIndexOf('</M:')
  const start = Math.max(lastOpen, lastClose)
  if (start < 0) return text
  if (isIndexInRanges(start, codeRanges)) return text
  const tail = text.slice(start)
  if (tail.includes('>')) return text
  if (!(tail.startsWith('<M:') || tail.startsWith('</M:'))) return text
  return text.slice(0, start).trimEnd()
}

export const collectTagMatches = (text: string): MetaTag[] => {
  const codeRanges = findMarkdownCodeRanges(text)
  return collectMetaTags(text, codeRanges)
}

export const extractActionText = (
  output: string,
): { actionText: string; text: string } => {
  const codeRanges = findMarkdownCodeRanges(output)
  const tags = collectMetaTags(output, codeRanges)
  const zone = findZone(output, tags)
  const actionText = zone ? output.slice(zone.parseStart) : ''
  const withoutActions = zone ? output.slice(0, zone.parseStart) : output
  const textCodeRanges = zone
    ? codeRanges.filter((range) => range.end <= zone.parseStart)
    : codeRanges
  const textTags = zone
    ? tags.filter((tag) => tag.end <= zone.parseStart)
    : tags
  const text = stripTrailingMetaTagFragment(
    removeTagsOutsideCodeBlocks(withoutActions, textTags),
    textCodeRanges,
  )
  return { actionText, text }
}
