import { Parser } from 'htmlparser2'

import { isIndexInRanges, type Range } from './markdown-code-ranges.js'
import {
  extractAttrText,
  extractTagNameFromRaw,
  findTagEnd,
  isSelfClosingTag,
  parseAttributes,
  parseMetaTagName,
} from './meta-tag-attrs.js'

type MetaTag = {
  fullName: string
  name: string
  attrs: Record<string, string>
  start: number
  end: number
  content?: string
}

type OpenMetaTag = {
  fullName: string
  name: string
  attrs: Record<string, string>
  start: number
  openEnd: number
}

export const collectMetaTags = (
  text: string,
  codeRanges: Range[],
): MetaTag[] => {
  if (!text) return []
  const tags: MetaTag[] = []
  const stack: OpenMetaTag[] = []
  let consumedUntil = -1
  const parser = new Parser(
    {
      onopentag: (parserTagName) => {
        const start = parser.startIndex
        if (start < 0 || start < consumedUntil) return
        if (isIndexInRanges(start, codeRanges)) return
        const openEnd = findTagEnd(text, start)
        if (!openEnd || openEnd <= start) return
        consumedUntil = openEnd
        const rawOpenTag = text.slice(start, openEnd)
        const tagName = extractTagNameFromRaw(rawOpenTag) ?? parserTagName
        const name = parseMetaTagName(tagName)
        if (!name) return
        const attrs = parseAttributes(extractAttrText(rawOpenTag, tagName))
        if (isSelfClosingTag(rawOpenTag)) {
          tags.push({ fullName: tagName, name, attrs, start, end: openEnd })
          return
        }
        stack.push({ fullName: tagName, name, attrs, start, openEnd })
      },
      onclosetag: (parserTagName) => {
        if (!parserTagName) return
        const name = parseMetaTagName(parserTagName)
        if (!name) return
        const closeStart = parser.startIndex
        const closeEnd = parser.endIndex + 1
        if (closeStart < 0 || closeEnd <= closeStart) return
        if (isIndexInRanges(closeStart, codeRanges)) return
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          const opened = stack[i]
          if (opened?.fullName !== parserTagName) continue
          stack.splice(i, 1)
          const content = text.slice(opened.openEnd, closeStart).trim()
          tags.push({
            fullName: opened.fullName,
            name: opened.name,
            attrs: opened.attrs,
            start: opened.start,
            end: closeEnd,
            ...(content ? { content } : {}),
          })
          break
        }
      },
    },
    {
      recognizeSelfClosing: true,
      lowerCaseTags: false,
      lowerCaseAttributeNames: false,
      decodeEntities: false,
      xmlMode: false,
    },
  )

  parser.write(text)
  parser.end()
  return tags.sort((left, right) => left.start - right.start)
}

export type { MetaTag }
