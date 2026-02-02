export type ParsedCommand = {
  action: string
  attrs: Record<string, string>
  content?: string
}

const MIMIKIT_TAG = /<MIMIKIT:(\w+)([^>]*?)(?:\/>|>([\s\S]*?)<\/MIMIKIT:\1>)/g

const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g

const parseAttrs = (raw: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const match of raw.matchAll(ATTR_RE)) {
    const key = match[1]
    const value = match[2] ?? ''
    if (!key) continue
    attrs[key] = value
  }
  return attrs
}

export const parseCommands = (
  output: string,
): {
  commands: ParsedCommand[]
  text: string
} => {
  const commands = [...output.matchAll(MIMIKIT_TAG)].map((match) => {
    const content = match[3]?.trim()
    return {
      action: match[1] ?? '',
      attrs: parseAttrs(match[2] ?? ''),
      ...(content ? { content } : {}),
    }
  })
  const text = output.replace(MIMIKIT_TAG, '').trim()
  return { commands, text }
}
