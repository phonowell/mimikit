import { z } from 'zod'

import type { Parsed } from '../model/parsed.js'

const LINE_RE = /^@([a-zA-Z_][\w-]*)(?:\s+(.+))?$/
const ATTR_RE = /(\w+)\s*=\s*"((?:\\.|[^"\\])*)"/g

const parsedSchema = z
  .object({
    name: z.string().trim().min(1),
    attrs: z.record(z.string(), z.string()),
    content: z.string().trim().min(1).optional(),
  })
  .strict()

const unescapeAttrValue = (value: string): string =>
  value.replace(/\\([\\"nrt])/g, (_match, token: string) => {
    if (token === 'n') return '\n'
    if (token === 'r') return '\r'
    if (token === 't') return '\t'
    return token
  })

const parseAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(ATTR_RE)) {
    const key = match[1]
    const value = unescapeAttrValue(match[2] ?? '')
    if (!key) continue
    attrs[key] = value
  }
  return attrs
}

const asParsed = (value: Parsed): Parsed | undefined => {
  const parsed = parsedSchema.safeParse(value)
  if (!parsed.success) return undefined
  return parsed.data
}

const parseLine = (line: string): Parsed | undefined => {
  const trimmed = line.trim()
  if (!trimmed.startsWith('@')) return undefined
  const match = trimmed.match(LINE_RE)
  if (!match) return undefined
  return asParsed({
    name: match[1] ?? '',
    attrs: parseAttrs(match[2]?.trim() ?? ''),
  })
}

export const parseLooseLines = (text: string): Parsed[] => {
  if (!text) return []
  return text
    .split('\n')
    .map((line) => parseLine(line))
    .filter((item): item is Parsed => item !== undefined)
}

export const parseTagMatches = (matches: RegExpMatchArray[]): Parsed[] =>
  matches
    .map((match) => {
      const content = match[3]?.trim()
      return asParsed({
        name: match[1] ?? '',
        attrs: parseAttrs(match[2] ?? ''),
        ...(content ? { content } : {}),
      })
    })
    .filter((item): item is Parsed => item !== undefined)
    .filter((item) => item.name !== 'actions')
