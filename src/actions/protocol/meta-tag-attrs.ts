const SPACE_RE = /\s/
const NAME_RE = /^[A-Za-z_][\w:-]*$/
const ATTR_RE =
  /([A-Za-z_][\w:-]*)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s"'=<>`]+))/g

const unescapeAttrValue = (value: string): string =>
  value.replace(/\\([\\"'nrt])/g, (_match, token: string) => {
    if (token === 'n') return '\n'
    if (token === 'r') return '\r'
    if (token === 't') return '\t'
    return token
  })

const isEscaped = (text: string, index: number): boolean => {
  let slashCount = 0
  for (
    let cursor = index - 1;
    cursor >= 0 && text.charAt(cursor) === '\\';
    cursor -= 1
  )
    slashCount += 1
  return slashCount % 2 === 1
}

export const findTagEnd = (
  text: string,
  tagStart: number,
): number | undefined => {
  if (tagStart < 0 || tagStart >= text.length || text.charAt(tagStart) !== '<')
    return
  let quote: '"' | "'" | '' = ''
  for (let cursor = tagStart + 1; cursor < text.length; cursor += 1) {
    const current = text.charAt(cursor)
    if (quote) {
      if (current === quote && !isEscaped(text, cursor)) quote = ''
      continue
    }
    if (current === '"' || current === "'") {
      quote = current
      continue
    }
    if (current === '>') return cursor + 1
  }
  return undefined
}

export const extractTagNameFromRaw = (
  rawOpenTag: string,
): string | undefined => {
  if (!rawOpenTag.startsWith('<')) return
  let cursor = 1
  const start = cursor
  while (cursor < rawOpenTag.length) {
    const current = rawOpenTag.charAt(cursor)
    if (current === '/' || current === '>' || SPACE_RE.test(current)) break
    cursor += 1
  }
  const fullName = rawOpenTag.slice(start, cursor)
  return NAME_RE.test(fullName) ? fullName : undefined
}

export const parseMetaTagName = (fullName: string): string | undefined => {
  const separator = fullName.indexOf(':')
  if (separator <= 0) return
  if (fullName.slice(0, separator).toLowerCase() !== 'm') return
  const name = fullName.slice(separator + 1)
  if (!NAME_RE.test(name)) return
  return name
}

export const extractAttrText = (
  rawOpenTag: string,
  fullName: string,
): string => {
  const head = `<${fullName}`
  if (!rawOpenTag.startsWith(head)) return ''
  const body = rawOpenTag.slice(head.length)
  return body.replace(/\/?\s*>$/, '')
}

export const parseAttributes = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(ATTR_RE)) {
    const key = match[1]
    if (!key) continue
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attrs[key] = unescapeAttrValue(value)
  }
  return attrs
}

export const isSelfClosingTag = (rawOpenTag: string): boolean =>
  /\/\s*>$/.test(rawOpenTag)
