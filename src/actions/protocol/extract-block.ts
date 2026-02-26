import {
  extractAttrText,
  extractTagNameFromRaw,
  findTagEnd,
  isSelfClosingTag,
  parseAttributes,
  parseMetaTagName,
} from './meta-tag-attrs.js'
import {
  findMarkdownCodeRanges,
  isIndexInRanges,
  type Range,
} from './markdown-code-ranges.js'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

type Zone = {
  parseStart: number
}

type MetaTag = {
  fullName: string
  name: string
  attrs: Record<string, string>
  start: number
  end: number
  content?: string
}

type PositionedHtmlNode = {
  type?: string
  value?: string
  position?: {
    start?: { offset?: number | null } | null
  } | null
}

const markdownParser = unified().use(remarkParse)

const hasOnlyWhitespace = (value: string): boolean => value.trim().length === 0

const parseMetaTagsInHtml = (html: string, offsetBase: number): MetaTag[] => {
  const tags: MetaTag[] = []
  let cursor = 0
  for (;;) {
    const openStart = html.indexOf('<M:', cursor)
    if (openStart < 0) break
    const openEnd = findTagEnd(html, openStart)
    if (!openEnd || openEnd <= openStart) break
    const rawOpenTag = html.slice(openStart, openEnd)
    const tagName = extractTagNameFromRaw(rawOpenTag)
    if (!tagName) {
      cursor = openStart + 3
      continue
    }
    const name = parseMetaTagName(tagName)
    if (!name) {
      cursor = openStart + 3
      continue
    }
    const attrs = parseAttributes(extractAttrText(rawOpenTag, tagName))
    if (isSelfClosingTag(rawOpenTag)) {
      tags.push({
        fullName: tagName,
        name,
        attrs,
        start: offsetBase + openStart,
        end: offsetBase + openEnd,
      })
      cursor = openEnd
      continue
    }
    const closeToken = `</${tagName}>`
    const closeStart = html.indexOf(closeToken, openEnd)
    if (closeStart < 0) {
      cursor = openEnd
      continue
    }
    const closeEnd = closeStart + closeToken.length
    const content = html.slice(openEnd, closeStart).trim()
    tags.push({
      fullName: tagName,
      name,
      attrs,
      start: offsetBase + openStart,
      end: offsetBase + closeEnd,
      ...(content ? { content } : {}),
    })
    cursor = closeEnd
  }
  return tags
}

const collectMetaTagsFromMarkdown = (
  text: string,
  codeRanges: Range[],
): MetaTag[] => {
  if (!text) return []
  const tree = markdownParser.parse(text)
  const tags = new Map<string, MetaTag>()
  const pushTag = (tag: MetaTag) => {
    if (isIndexInRanges(tag.start, codeRanges)) return
    tags.set(`${tag.start}:${tag.end}:${tag.name}`, tag)
  }
  visit(tree, 'html', (node) => {
    const htmlNode = node as PositionedHtmlNode
    const value = typeof htmlNode.value === 'string' ? htmlNode.value : ''
    if (!value) return
    const startOffset = htmlNode.position?.start?.offset
    if (!Number.isFinite(startOffset)) return
    for (const tag of parseMetaTagsInHtml(value, Number(startOffset)))
      pushTag(tag)
  })
  for (const tag of parseMetaTagsInHtml(text, 0)) pushTag(tag)
  return Array.from(tags.values()).sort((left, right) => left.start - right.start)
}

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
  return collectMetaTagsFromMarkdown(text, codeRanges)
}

export const extractActionText = (
  output: string,
): { actionText: string; text: string } => {
  const codeRanges = findMarkdownCodeRanges(output)
  const tags = collectMetaTagsFromMarkdown(output, codeRanges)
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
