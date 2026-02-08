const COMMAND_ATTR_RE = /(\w+)\s*=\s*"((?:\\.|[^"\\])*)"/g

const unescapeCommandAttrValue = (value: string): string =>
  value.replace(/\\([\\"nrt])/g, (_match, token: string) => {
    if (token === 'n') return '\n'
    if (token === 'r') return '\r'
    if (token === 't') return '\t'
    return token
  })

export const parseCommandAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(COMMAND_ATTR_RE)) {
    const key = match[1]
    const value = unescapeCommandAttrValue(match[2] ?? '')
    if (!key) continue
    attrs[key] = value
  }
  return attrs
}
