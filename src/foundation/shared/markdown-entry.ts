import { normalizeInlineWhitespace } from './text.js'

const META_LINE_RE = /^([a-z_]+):\s*(.*)$/i

export const normalizeEntryInline = (value: string): string =>
  normalizeInlineWhitespace(value)

export const normalizeEntryText = (value: string): string =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const parseEntryMetaAndContent = (
  body: string,
): {
  meta: Map<string, string>
  content: string
} => {
  const trimmed = normalizeEntryText(body)
  if (!trimmed) return { meta: new Map(), content: '' }
  const sections = trimmed.split(/\n{2,}/)
  const first = sections[0]
  if (!first) return { meta: new Map(), content: trimmed }
  const lines = first.split('\n').map((line) => line.trim())
  if (lines.length === 0 || lines.some((line) => !META_LINE_RE.test(line)))
    return { meta: new Map(), content: trimmed }
  const meta = new Map<string, string>()
  for (const line of lines) {
    const matched = line.match(META_LINE_RE)
    const key = matched?.[1]?.toLowerCase()
    if (!key) continue
    meta.set(key, matched?.[2]?.trim() ?? '')
  }
  return {
    meta,
    content: normalizeEntryText(sections.slice(1).join('\n\n')),
  }
}
