import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

import { isIndexInRanges, type Range } from './markdown-code-ranges.js'
import {
  extractAttrText,
  extractTagNameFromRaw,
  findTagEnd,
  isSelfClosingTag,
  parseAttributes,
  parseMetaTagName,
} from './meta-tag-attrs.js'

export type MetaTag = {
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
    if (!attrs) {
      cursor = openEnd
      continue
    }

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

export const collectMetaTagsFromMarkdown = (
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

  return Array.from(tags.values()).sort(
    (left, right) => left.start - right.start,
  )
}
